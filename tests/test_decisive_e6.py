"""决战 E6 v6 纯逻辑单测。

运行::

    .\\python\\python.exe -m unittest tests.test_decisive_e6 -v
"""

from __future__ import annotations

import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from autowsgr.combat.plan import CombatMode, CombatPlan
from autowsgr.combat.state import CombatPhase
from autowsgr.infra import ChapterResetError, DecisiveConfig
from autowsgr.ops.decisive import DecisiveController
from autowsgr.ops.decisive.logic import (
    BuyExpDecision,
    DecisiveLogic,
    SortieMode,
)
from autowsgr.ops.decisive.state import DecisiveState
from autowsgr.types import DecisiveEntryStatus, DecisivePhase, FleetSelection, Formation
from autowsgr.ui.decisive import ChapterResetOutcome, DecisiveBattlePage
from autowsgr.ui.decisive.fleet_ocr import (
    _parse_card_cost_text,
    _roi_from_area,
    is_buy_exp_disabled,
    parse_skill_level,
)
from autowsgr.ui.decisive.instructor import (
    InstructorAction,
    InstructorMatcher,
    select_replace_target,
)
from autowsgr.ui.decisive.map_controller import SortieOutcome
from autowsgr.ui.decisive.overlay import BUY_EXP_ACTIVE_COLOR, BUY_EXP_PROBE
from autowsgr.vision import OCRResult


def offer(name: str, cost: int) -> FleetSelection:
    return FleetSelection(name=name, cost=cost, click_position=(0.5, 0.5))


def offers(**costs: int) -> dict[str, FleetSelection]:
    return {name: offer(name, cost) for name, cost in costs.items()}


SUBS = ['U-47', 'U-1206', 'U-96', 'U-81', 'U-1405', '鲃鱼']


class _Base(unittest.TestCase):
    def make(
        self,
        *,
        stage: int = 1,
        node: str = 'A',
        score: int = 10,
        ships: dict[str, int] | None = None,
        instructor: str = '紫貂',
        level: int = 1,
        **config: object,
    ) -> tuple[DecisiveState, DecisiveLogic]:
        cfg = DecisiveConfig(
            chapter=6,
            submarine_pool=SUBS + ['射水鱼'],
            must_have=['U-47', 'U-1206'],
            **config,
        )
        state = DecisiveState(chapter=6, stage=stage, node=node, score=score)
        state.ship_levels = dict(ships or {})
        state.instructor = instructor
        state.instructor_level = level
        return state, DecisiveLogic(cfg, state)


class TestPurchasePriority(_Base):
    def test_opening_ship_is_first_at_6_1_a(self) -> None:
        state, logic = self.make()
        # 实机 6-1 A：考文垂 2 + U-47 6，余额 10，两者都买得起；
        # 后面的 U-1206/U-96 买不起，不能因此退化成只买考文垂。
        sel = offers(考文垂=2, **{'U-47': 6, 'U-1206': 6, 'U-96': 4, '黑科技': 5})
        self.assertEqual(logic.choose_purchases(sel), ['考文垂', 'U-47'])

    def test_opening_offer_complete_requires_must_have(self) -> None:
        state, logic = self.make(node='U')
        self.assertFalse(logic.opening_offer_complete(offers(考文垂=2, 潜乙=4)))
        self.assertTrue(
            logic.opening_offer_complete(offers(考文垂=2, **{'U-47': 6}))
        )

    def test_4_subs_missing_u47_buys_at_most_one_other(self) -> None:
        state, logic = self.make(
            stage=2,
            ships={'U-1206': 1, 'U-96': 1, 'U-81': 1, 'U-1405': 1},
            score=20,
        )
        sel = offers(鲃鱼=4, 射水鱼=4)
        self.assertEqual(logic.choose_purchases(sel), ['鲃鱼'])

    def test_opening_ready_requires_must_have_owned(self) -> None:
        state, logic = self.make(ships={'考文垂': 1})
        self.assertFalse(logic.opening_ready())
        state.ship_levels['U-1206'] = 1
        self.assertTrue(logic.opening_ready())

    def test_opening_ship_priority_before_node_recognition(self) -> None:
        # 首次进 6-1 时购买弹窗先出现，node 还是 U，也必须优先买考文垂。
        state, logic = self.make(node='U')
        sel = offers(考文垂=2, **{'U-47': 6, 'U-96': 4})
        self.assertEqual(logic.choose_purchases(sel), ['考文垂', 'U-47'])

    def test_buys_lower_priority_if_higher_unaffordable(self) -> None:
        state, logic = self.make(stage=2, score=5)
        sel = offers(**{'U-47': 6, 'U-96': 4})
        self.assertEqual(logic.choose_purchases(sel), ['U-96'])

    def test_opening_buys_only_coventry_and_must_have(self) -> None:
        state, logic = self.make(score=30)
        sel = offers(考文垂=2, **{'U-47': 4, 'U-1206': 6, 'U-96': 4})
        self.assertEqual(logic.choose_purchases(sel), ['考文垂', 'U-47', 'U-1206'])

    def test_opening_ship_skipped_when_owned(self) -> None:
        state, logic = self.make(ships={'考文垂': 1}, score=30)
        sel = offers(考文垂=2, **{'U-47': 4, 'U-1206': 6})
        self.assertEqual(logic.choose_purchases(sel), ['U-47', 'U-1206'])

    def test_priority_order_u47_then_u1206_then_other(self) -> None:
        state, logic = self.make(stage=2, score=30)
        sel = offers(**{'U-96': 4, 'U-1206': 5, 'U-47': 3})
        self.assertEqual(logic.choose_purchases(sel), ['U-47', 'U-1206', 'U-96'])

    def test_full_fleet_only_buys_duplicates(self) -> None:
        state, logic = self.make(
            stage=2,
            node='A',
            ships={name: 1 for name in ['U-47', 'U-1206', 'U-96', 'U-1405', '鲃鱼', '射水鱼']},
        )
        sel = offers(**{'U-47': 4, 'U-81': 5, '射水鱼': 4})
        self.assertEqual(logic.choose_purchases(sel), ['U-47', '射水鱼'])

    def test_must_have_still_bought_when_full(self) -> None:
        state, logic = self.make(ships={name: 1 for name in SUBS if name != 'U-47'})
        sel = offers(**{'U-47': 4, 'U-96': 5})
        self.assertEqual(logic.choose_purchases(sel), ['U-47'])

    def test_non_submarine_and_skill_ignored(self) -> None:
        state, logic = self.make()
        sel = offers(捷尔任斯基=5, 黑科技=5)
        self.assertEqual(logic.choose_purchases(sel), [])

    def test_5_subs_missing_u1206_does_not_buy_other_new(self) -> None:
        state, logic = self.make(
            stage=2,
            ships={'U-47': 1, 'U-96': 1, 'U-81': 1, 'U-1405': 1, '鲃鱼': 1},
            score=20,
        )
        sel = offers(射水鱼=4, **{'IIIA': 4})
        self.assertEqual(logic.choose_purchases(sel), [])

    def test_6_subs_missing_u1206_still_buys_u1206(self) -> None:
        state, logic = self.make(
            stage=2,
            ships={'U-47': 1, 'U-96': 1, 'U-81': 1, 'U-1405': 1, '鲃鱼': 1, '射水鱼': 1},
            score=10,
        )
        sel = offers(**{'U-1206': 6, '射水鱼': 4})
        self.assertEqual(logic.choose_purchases(sel), ['U-1206'])

    def test_target_fleet_complete_requires_both_must_have(self) -> None:
        state, logic = self.make(
            stage=2,
            ships={'U-47': 1, 'U-96': 1, 'U-81': 1, 'U-1405': 1, '鲃鱼': 1, '射水鱼': 1},
        )
        self.assertFalse(logic.target_fleet_complete())
        state.ship_levels['U-1206'] = 1
        self.assertTrue(logic.target_fleet_complete())

    def test_more_than_6_subs_keeps_both_must_have_in_fleet(self) -> None:
        state, logic = self.make(
            stage=2,
            node='A',
            ships={
                'U-47': 1,
                'U-1206': 1,
                'U-96': 1,
                'U-81': 1,
                'U-1405': 1,
                '鲃鱼': 1,
                '射水鱼': 1,
            },
        )
        target = logic.get_best_fleet()
        self.assertEqual(len([name for name in target if name]), 6)
        self.assertIn('U-47', target)
        self.assertIn('U-1206', target)

    def test_insufficient_budget_returns_empty(self) -> None:
        state, logic = self.make(score=1)
        sel = offers(考文垂=2, **{'U-47': 4})
        self.assertEqual(logic.choose_purchases(sel), [])


class TestFleetSelection(_Base):
    def test_a_only_coventry(self) -> None:
        state, logic = self.make(ships={'考文垂': 1, 'U-47': 1, 'U-1206': 1})
        self.assertEqual(logic.get_best_fleet(), ['', '考文垂', '', '', '', '', ''])

    def test_a_without_coventry_is_empty(self) -> None:
        state, logic = self.make(ships={'U-47': 1})
        self.assertEqual(logic.get_best_fleet(), [''] * 7)

    def test_b_keeps_coventry(self) -> None:
        state, logic = self.make(node='B', ships={'考文垂': 1, 'U-47': 1})
        fleet = logic.get_best_fleet()
        self.assertIn('考文垂', fleet)
        self.assertIn('U-47', fleet)

    def test_c_drops_coventry(self) -> None:
        state, logic = self.make(node='C', ships={'考文垂': 1, 'U-47': 1})
        self.assertNotIn('考文垂', logic.get_best_fleet())

    def test_d_after_c_does_not_re_add_coventry(self) -> None:
        state, logic = self.make(
            stage=1,
            node='D',
            ships={'考文垂': 1, 'U-1206': 1, 'U-441': 1, 'IIIA': 1},
        )
        target = logic.get_best_fleet()
        self.assertNotIn('考文垂', target)
        self.assertIn('U-1206', target)

    def test_stage2_does_not_re_add_coventry(self) -> None:
        state, logic = self.make(
            stage=2,
            node='A',
            ships={'考文垂': 1, 'U-1206': 1},
        )
        self.assertNotIn('考文垂', logic.get_best_fleet())

    def test_b_deploys_subs_bought_at_a(self) -> None:
        state, logic = self.make(
            stage=1,
            node='B',
            ships={'考文垂': 1, 'U-1206': 1},
        )
        target = logic.get_best_fleet()
        self.assertIn('考文垂', target)
        self.assertIn('U-1206', target)
        plan = logic.sortie_plan(
            target,
            current_fleet=['', '考文垂', '', '', '', '', ''],
        )
        self.assertEqual(plan.mode, SortieMode.MANUAL)

    def test_c_deploys_new_sub_and_drops_coventry(self) -> None:
        state, logic = self.make(
            stage=1,
            node='C',
            ships={'考文垂': 1, 'U-1206': 1, '射水鱼': 1},
        )
        target = logic.get_best_fleet()
        self.assertNotIn('考文垂', target)
        self.assertIn('射水鱼', target)
        plan = logic.sortie_plan(
            target,
            current_fleet=['', '考文垂', 'U-1206', '', '', '', ''],
        )
        self.assertEqual(plan.mode, SortieMode.MANUAL)

    def test_incomplete_fleet_keeps_empty_slots(self) -> None:
        state, logic = self.make(stage=2, node='A', ships={'U-47': 1})
        self.assertEqual(logic.get_best_fleet(), ['', 'U-47', '', '', '', '', ''])

    def test_flagship_priority_moves_to_front(self) -> None:
        state, logic = self.make(
            stage=2,
            node='A',
            ships={'U-47': 1, 'U-1206': 1},
            flagship_priority=['U-1206', 'U-47'],
        )
        self.assertEqual(logic.get_best_fleet()[1], 'U-1206')


class TestRetreat(_Base):
    def test_one_ship_at_a_is_allowed_with_must_have(self) -> None:
        state, logic = self.make(ships={'考文垂': 1, 'U-1206': 1})
        self.assertFalse(logic.must_retreat(logic.get_best_fleet()))

    def test_a_with_only_coventry_retreats(self) -> None:
        state, logic = self.make(ships={'考文垂': 1})
        self.assertTrue(logic.must_retreat(logic.get_best_fleet()))

    def test_empty_fleet_retreats(self) -> None:
        state, logic = self.make(ships={'U-47': 1})
        self.assertTrue(logic.must_retreat(logic.get_best_fleet()))

    def test_default_min_ships_one(self) -> None:
        state, logic = self.make(stage=2, node='A', ships={'U-47': 1})
        self.assertFalse(logic.must_retreat(logic.get_best_fleet()))


class TestFormation(_Base):
    def test_nine_key_points_use_wedge(self) -> None:
        key_points = {1: 'BGJ', 2: 'CHJ', 3: 'DGJ'}
        for stage, nodes in key_points.items():
            for node in nodes:
                with self.subTest(stage=stage, node=node):
                    state, logic = self.make(stage=stage, node=node)
                    self.assertEqual(logic.get_formation(), Formation.wedge)

    def test_non_key_point_uses_double_column(self) -> None:
        state, logic = self.make(stage=1, node='A')
        self.assertEqual(logic.get_formation(), Formation.double_column)

    def test_spot_enemy_failure_does_not_change_formation(self) -> None:
        state, logic = self.make(stage=1, node='G')
        self.assertEqual(logic.get_formation(), Formation.wedge)

    def test_e6_1_b_does_not_pursue_night(self) -> None:
        state, logic = self.make(stage=1, node='B')
        self.assertTrue(logic.is_key_point())
        self.assertFalse(logic.should_pursue_night())
        # 阵型仍按关键点使用梯形。
        self.assertEqual(logic.get_formation(), Formation.wedge)

    def test_other_key_points_still_pursue_night(self) -> None:
        for stage, node in [
            (1, 'G'),
            (1, 'J'),
            (2, 'C'),
            (2, 'H'),
            (2, 'J'),
            (3, 'D'),
            (3, 'G'),
            (3, 'J'),
        ]:
            with self.subTest(stage=stage, node=node):
                state, logic = self.make(stage=stage, node=node)
                self.assertTrue(logic.should_pursue_night())


class TestNodeAdvance(_Base):
    def test_unknown_node_stays_u(self) -> None:
        state, logic = self.make(node='U')
        self.assertEqual(logic.next_node(), 'U')

    def test_letter_increment(self) -> None:
        state, logic = self.make(node='A')
        self.assertEqual(logic.next_node(), 'B')

    def test_stage_end_j(self) -> None:
        state, logic = self.make(stage=1, node='J')
        self.assertTrue(logic.is_stage_end())
        self.assertTrue(logic.is_key_point())


class TestSnapshot(_Base):
    def test_restore_all_but_health(self) -> None:
        state, logic = self.make(
            stage=2,
            node='C',
            score=12,
            ships={'考文垂': 1, 'U-47': 2},
            instructor='紫貂',
            level=3,
        )
        state.skill_used_levels = {3}
        state.capture_stage_snapshot()

        state.stage = 2
        state.node = 'F'
        state.score = 1
        state.ship_levels = {'U-96': 1}
        state.instructor = '奇尔沙治'
        state.instructor_level = 8
        state.skill_used_levels = {8}
        state.refresh_count = 3

        self.assertTrue(state.restore_stage_snapshot())
        self.assertEqual(state.stage, 2)
        self.assertEqual(state.node, 'A')
        self.assertEqual(state.score, 12)
        self.assertEqual(state.ship_levels, {'考文垂': 1, 'U-47': 2})
        self.assertEqual(state.instructor, '紫貂')
        self.assertEqual(state.instructor_level, 3)
        self.assertEqual(state.skill_used_levels, {3})
        self.assertEqual(state.refresh_count, 0)
        self.assertFalse(hasattr(state, 'ship_stats'))

    def test_restore_without_snapshot_returns_false(self) -> None:
        state, _ = self.make()
        self.assertFalse(state.restore_stage_snapshot())


class TestSkills(_Base):
    def test_threshold_ascending(self) -> None:
        state, logic = self.make(level=8, instructor='紫貂')
        self.assertEqual(logic.next_skill_threshold(), 3)
        state.skill_used_levels.add(3)
        self.assertEqual(logic.next_skill_threshold(), 8)
        state.skill_used_levels.add(8)
        self.assertIsNone(logic.next_skill_threshold())

    def test_no_threshold_below_level(self) -> None:
        state, logic = self.make(level=2)
        self.assertIsNone(logic.next_skill_threshold())

    def test_unknown_instructor_has_no_threshold(self) -> None:
        state, logic = self.make(level=10, instructor='奇尔沙治')
        self.assertIsNone(logic.next_skill_threshold())

    def test_instructor_by_stage(self) -> None:
        state, logic = self.make()
        self.assertEqual(logic.instructor_for_stage(1), '紫貂')
        self.assertEqual(logic.instructor_for_stage(2), '紫貂')
        self.assertEqual(logic.instructor_for_stage(3), '奇尔沙治')

    def test_buy_exp_decision(self) -> None:
        state, logic = self.make()
        self.assertEqual(
            logic.buy_exp_decision(score=5, level=1, disabled=False),
            BuyExpDecision.BUY,
        )
        self.assertEqual(
            logic.buy_exp_decision(score=4, level=1, disabled=False),
            BuyExpDecision.STOP_SCORE,
        )
        self.assertEqual(
            logic.buy_exp_decision(score=10, level=10, disabled=False),
            BuyExpDecision.STOP_FULL,
        )
        self.assertEqual(
            logic.buy_exp_decision(score=10, level=1, disabled=True),
            BuyExpDecision.STOP_FULL,
        )
        self.assertEqual(
            logic.buy_exp_decision(score=10, level=1, disabled=False, popup=True),
            BuyExpDecision.STOP_POPUP,
        )


class TestBuyExpLoop(_Base):
    def test_stops_on_score(self) -> None:
        scores = iter([7, 2])
        clicks: list[int] = []
        outcome = DecisiveLogic.run_buy_exp_loop(
            initial_score=12,
            initial_level=1,
            cost=5,
            max_level=10,
            max_clicks=10,
            read_score=lambda: next(scores, None),
            read_level=lambda: 1,
            is_disabled=lambda: False,
            click_buy=lambda: clicks.append(1),
            handle_popup=lambda: False,
        )
        self.assertEqual(len(clicks), 2)
        self.assertEqual(outcome.score, 2)
        self.assertEqual(outcome.stop_reason, BuyExpDecision.STOP_SCORE)

    def test_stops_on_disabled(self) -> None:
        disabled = iter([False, True])
        clicks: list[int] = []
        outcome = DecisiveLogic.run_buy_exp_loop(
            initial_score=20,
            initial_level=1,
            cost=5,
            max_level=10,
            max_clicks=10,
            read_score=lambda: 15,
            read_level=lambda: 1,
            is_disabled=lambda: next(disabled, True),
            click_buy=lambda: clicks.append(1),
            handle_popup=lambda: False,
        )
        self.assertEqual(len(clicks), 1)
        self.assertEqual(outcome.stop_reason, BuyExpDecision.STOP_FULL)

    def test_stops_on_popup(self) -> None:
        clicks: list[int] = []
        outcome = DecisiveLogic.run_buy_exp_loop(
            initial_score=20,
            initial_level=1,
            cost=5,
            max_level=10,
            max_clicks=10,
            read_score=lambda: 15,
            read_level=lambda: 1,
            is_disabled=lambda: False,
            click_buy=lambda: clicks.append(1),
            handle_popup=lambda: True,
        )
        self.assertEqual(len(clicks), 1)
        self.assertEqual(outcome.stop_reason, BuyExpDecision.STOP_POPUP)

    def test_ocr_drift_falls_back_to_local_decrement(self) -> None:
        clicks: list[int] = []
        outcome = DecisiveLogic.run_buy_exp_loop(
            initial_score=11,
            initial_level=1,
            cost=5,
            max_level=10,
            max_clicks=10,
            read_score=lambda: None,
            read_level=lambda: None,
            is_disabled=lambda: False,
            click_buy=lambda: clicks.append(1),
            handle_popup=lambda: False,
        )
        self.assertEqual(len(clicks), 2)
        self.assertEqual(outcome.score, 1)
        self.assertEqual(outcome.stop_reason, BuyExpDecision.STOP_SCORE)

    def test_guard_stops_infinite_loop(self) -> None:
        clicks: list[int] = []
        outcome = DecisiveLogic.run_buy_exp_loop(
            initial_score=100,
            initial_level=1,
            cost=5,
            max_level=10,
            max_clicks=3,
            read_score=lambda: 100,
            read_level=lambda: 1,
            is_disabled=lambda: False,
            click_buy=lambda: clicks.append(1),
            handle_popup=lambda: False,
        )
        self.assertEqual(len(clicks), 2)
        self.assertEqual(outcome.stop_reason, BuyExpDecision.STOP_FULL)


class TestRefreshAndSortie(_Base):
    def test_refresh_only_once(self) -> None:
        state, logic = self.make()
        self.assertTrue(logic.refresh_allowed())
        state.refresh_count = 1
        self.assertFalse(logic.refresh_allowed())

    def test_full_submarine_fleet_quick_sortie(self) -> None:
        state, logic = self.make(stage=2, node='A', ships={name: 1 for name in SUBS})
        fleet = logic.get_best_fleet()
        plan = logic.sortie_plan(fleet, current_fleet=fleet)
        self.assertEqual(plan.mode, SortieMode.QUICK)
        self.assertFalse(plan.use_instructor_skill)

    def test_fleet_mismatch_forces_manual(self) -> None:
        state, logic = self.make(
            stage=1,
            node='C',
            ships={'考文垂': 1, **{name: 1 for name in SUBS}},
        )
        target = logic.get_best_fleet()
        current = ['', '考文垂', 'U-47', 'U-1206', 'U-96', 'U-81', 'U-1405']
        plan = logic.sortie_plan(target, current_fleet=current)
        self.assertEqual(plan.mode, SortieMode.MANUAL)
        self.assertEqual(plan.reason, 'fleet_mismatch')

    def test_matching_fleet_quick(self) -> None:
        state, logic = self.make(stage=2, node='A', ships={name: 1 for name in SUBS})
        target = logic.get_best_fleet()
        self.assertTrue(logic.fleet_matches(target, target))

    def test_partial_fleet_manual(self) -> None:
        state, logic = self.make(stage=2, node='A', ships={'U-47': 1})
        plan = logic.sortie_plan(logic.get_best_fleet())
        self.assertEqual(plan.mode, SortieMode.MANUAL)
        self.assertFalse(plan.use_instructor_skill)

    def test_stage3_j_manual_with_instructor_skill(self) -> None:
        state, logic = self.make(
            stage=3,
            node='J',
            ships={name: 1 for name in SUBS},
            instructor='奇尔沙治',
        )
        plan = logic.sortie_plan(logic.get_best_fleet())
        self.assertEqual(plan.mode, SortieMode.MANUAL)
        self.assertTrue(plan.use_instructor_skill)


class TestCombatPlan(unittest.TestCase):
    def test_decisive_skip_result_handler(self) -> None:
        plan = CombatPlan(mode=CombatMode.DECISIVE, skip_result_handler=True)
        self.assertTrue(plan.skip_result_handler)
        self.assertEqual(plan.end_phase, CombatPhase.RESULT)
        self.assertFalse(plan.collect_result_info)


class TestOcrHelpers(unittest.TestCase):
    def test_roi_normalizes_reversed_y(self) -> None:
        roi = _roi_from_area(((0.911, 0.082), (0.974, 0.037)))
        self.assertLess(roi.y1, roi.y2)
        self.assertLess(roi.x1, roi.x2)

    def test_parse_card_cost_strips_coin_icon(self) -> None:
        self.assertEqual(_parse_card_cost_text('X2'), 2)
        self.assertEqual(_parse_card_cost_text('82'), 2)
        self.assertEqual(_parse_card_cost_text('812'), 12)
        self.assertEqual(_parse_card_cost_text('8'), 8)
        self.assertIsNone(_parse_card_cost_text(''))

    def test_parse_skill_level(self) -> None:
        self.assertEqual(parse_skill_level('Lv.1(0/10)'), 1)
        self.assertEqual(parse_skill_level('Lv.8(3/10)'), 8)
        self.assertEqual(parse_skill_level('Lv.10'), 10)
        self.assertEqual(parse_skill_level('3(0/10)'), 3)
        self.assertIsNone(parse_skill_level(''))
        self.assertIsNone(parse_skill_level('abc'))

    def test_buy_exp_disabled_color_probe(self) -> None:
        screen = np.zeros((720, 1280, 3), dtype=np.uint8)
        x, y = int(BUY_EXP_PROBE[0] * 1280), int(BUY_EXP_PROBE[1] * 720)
        screen[y, x] = BUY_EXP_ACTIVE_COLOR
        self.assertFalse(is_buy_exp_disabled(screen))
        screen[y, x] = (128, 128, 128)
        # 默认不靠像素猜灰态；只有显式配置灰态颜色才拦截。
        self.assertFalse(is_buy_exp_disabled(screen))
        self.assertTrue(is_buy_exp_disabled(screen, disabled_color=(128, 128, 128)))


class TestInstructorHelpers(unittest.TestCase):
    ROOT = Path(__file__).resolve().parents[1] / 'python' / 'site-packages' / 'autowsgr' / 'data' / 'images' / 'decisive'
    ROI = (26 / 1280, 94 / 720, 422 / 1280, 619 / 720)

    def _screen_with(self, filename: str) -> np.ndarray:
        import cv2

        path = self.ROOT / filename
        image = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        screen = np.zeros((720, 1280, 3), dtype=np.uint8)
        height, width = image.shape[:2]
        screen[94 : 94 + height, 26 : 26 + width] = image
        return screen

    def test_matcher_identifies_templates(self) -> None:
        matcher = InstructorMatcher(
            {
                '紫貂': 'instructor_zidiao_720p.png',
                '奇尔沙治': 'instructor_kearsarge_720p.png',
            },
            root=self.ROOT,
        )
        self.assertEqual(
            matcher.identify(self._screen_with('instructor_zidiao_720p.png'), self.ROI),
            '紫貂',
        )
        self.assertEqual(
            matcher.identify(self._screen_with('instructor_kearsarge_720p.png'), self.ROI),
            '奇尔沙治',
        )
        self.assertIsNone(matcher.identify(np.zeros((720, 1280, 3), dtype=np.uint8), self.ROI))

    def test_select_replace_target_same_row(self) -> None:
        results = [
            OCRResult('紫貂', 0.9, (700, 215, 745, 240)),
            OCRResult('替换', 0.9, (800, 550, 870, 600)),
        ]
        located = select_replace_target(
            results,
            '紫貂',
            screen_width=1280,
            screen_height=720,
        )
        # 两行不重叠时不应误匹配；生产用 bbox=None 走固定按钮兜底。
        self.assertIsNotNone(located)
        assert located is not None
        self.assertEqual(located.action, InstructorAction.UNKNOWN)

        located = select_replace_target(
            [
                OCRResult('紫貂', 0.9, (700, 215, 745, 240)),
                OCRResult('替换', 0.9, None),
            ],
            '紫貂',
            screen_width=1280,
            screen_height=720,
        )
        self.assertIsNotNone(located)
        assert located is not None
        self.assertEqual(located.action, InstructorAction.REPLACE)
        self.assertIsNone(located.click_position)

    def test_working_instructor(self) -> None:
        located = select_replace_target(
            [
                OCRResult('奇尔沙治', 0.9, (700, 215, 800, 240)),
                OCRResult('工作中', 0.9, None),
            ],
            '奇尔沙治',
            screen_width=1280,
            screen_height=720,
        )
        self.assertIsNotNone(located)
        assert located is not None
        self.assertEqual(located.action, InstructorAction.WORKING)


class _FakeCtrl:
    def screenshot(self) -> np.ndarray:
        return np.zeros((540, 960, 3), dtype=np.uint8)

    def click(self, *args: object, **kwargs: object) -> None:
        pass


def make_controller(**config: object) -> DecisiveController:
    """构造只注入假 ctrl 的决战控制器（不触网、不读真配置）。"""
    ctx = SimpleNamespace(
        ctrl=_FakeCtrl(),
        ocr=SimpleNamespace(),
        config=SimpleNamespace(decisive_battle=None),
        stop_event=threading.Event(),
        ship_registry={},
    )
    return DecisiveController(ctx, DecisiveConfig(chapter=6, **config))


class _FakeResetPage:
    """`_handle_enter_map` 用：入口=可重置，重置结果由脚本给定。"""

    def __init__(self, outcome: ChapterResetOutcome) -> None:
        self.outcome = outcome
        self.entered = False
        self.instructors: list[str] = []

    def detect_entry_status(self, **kwargs: object) -> DecisiveEntryStatus:
        return DecisiveEntryStatus.REFRESH

    def reset_chapter(self, **kwargs: object) -> ChapterResetOutcome:
        return self.outcome

    def detect_stage(self, screen: object, chapter: int) -> int:
        return 1

    def ensure_instructor(self, instructor: str) -> None:
        self.instructors.append(instructor)

    def click_enter_map(self) -> None:
        self.entered = True


class _FakeMap:
    def __init__(
        self,
        *,
        offers: dict[str, FleetSelection],
        score: int = 10,
        phase: DecisivePhase = DecisivePhase.PREPARE_COMBAT,
    ) -> None:
        self.offers = offers
        self.score = score
        self.phase = phase
        self.overlay_open = True
        self.refreshed = 0
        self.bought: list[str] = []
        self.buy_ok = True
        self.map_score: int | None = None
        self.map_level: int = 10
        self.exp_clicks = 0
        self.skill_clicks = 0
        self.closed = False
        self.first_called = False
        self.finished = False
        self.cleared = False
        self.retreat_opened = False
        self.retreat_confirmed = False

    def wait_for_fleet_overlay_stable(self, screen: object = None, timeout: float = 8.0) -> np.ndarray:
        return np.zeros((540, 960, 3), dtype=np.uint8)

    def recognize_fleet_options(
        self,
        screen: object = None,
        fallback_score: int | None = None,
        *,
        score_status: list[bool] | None = None,
    ):
        if score_status is not None:
            score_status.append(True)
        return self.score, self.offers

    def read_score(self, screen: object = None, *, map_page: bool = True):
        return self.map_score

    def read_skill_level(self, screen: object = None) -> int:
        return self.map_level

    def is_buy_exp_disabled(self, screen: object = None) -> bool:
        return False

    def click_buy_exp(self) -> None:
        self.exp_clicks += 1

    def click_skill(self) -> None:
        self.skill_clicks += 1

    def drain_insufficient_popup(self) -> bool:
        return False

    def is_fleet_overlay_open(self) -> bool:
        return self.overlay_open

    def refresh_fleet(self) -> None:
        self.refreshed += 1

    def buy_fleet_offers(
        self,
        names: list[str],
        selections: dict[str, FleetSelection],
    ) -> list[str]:
        self.bought = list(names)
        if not self.buy_ok:
            return []
        self.overlay_open = False
        return list(names)

    def buy_first_offer_and_confirm(self) -> bool:
        self.first_called = True
        self.overlay_open = False
        return True

    def close_fleet_overlay(self) -> bool:
        self.closed = True
        self.overlay_open = False
        return True

    def detect_decisive_phase(self, screen: object = None):
        return self.phase

    def finish_battle_to_map(self, timeout: float | None = None):
        self.finished = True
        return self.phase

    def finish_stage_clear(self, timeout: float = 20.0) -> None:
        self.cleared = True

    def open_retreat_dialog(self) -> None:
        self.retreat_opened = True

    def confirm_retreat(self) -> None:
        self.retreat_confirmed = True


class TestHandlers(_Base):
    def make_controller(self, **config: object) -> DecisiveController:
        return make_controller(**config)

    def test_run_records_last_error_for_terminal_task(self) -> None:
        controller = self.make_controller()
        controller._prepare_entry_state = lambda: None

        def _boom() -> None:
            raise RuntimeError('boom')

        controller._main_loop = _boom  # type: ignore[method-assign]
        result = controller.run()
        self.assertEqual(result.value, 'error')
        self.assertEqual(controller.last_error, 'boom')

    def test_choose_fleet_buys_priority_and_updates_state(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={
                '考文垂': offer('考文垂', 2),
                'U-47': offer('U-47', 4),
                'U-1206': offer('U-1206', 6),
            },
            score=20,
        )
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'A'
        controller._state.score = 10
        controller._handle_choose_fleet()
        self.assertEqual(fake_map.bought, ['考文垂', 'U-47', 'U-1206'])
        self.assertEqual(controller._state.ship_levels, {'考文垂': 1, 'U-47': 1, 'U-1206': 1})
        self.assertEqual(controller._state.score, 8)
        self.assertEqual(controller._state.phase, DecisivePhase.PREPARE_COMBAT)

    def test_prepare_does_not_use_skill_before_purchase_page_closes(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=3)
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'B'
        controller._state.instructor = '紫貂'
        controller._state.instructor_level = 3
        controller._state.ship_levels = {name: 1 for name in SUBS}

        controller._handle_prepare_combat()
        self.assertEqual(fake_map.skill_clicks, 0)

    def test_purchase_page_closes_before_skill_at_any_node(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(
            level=3,
            scores=[3],
        )
        fake_map.offers = {'U-47': offer('U-47', 6)}
        fake_map.score = 10
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'B'
        controller._state.instructor_level = 3
        controller._state.ship_levels = {
            '考文垂': 1,
            'U-1206': 1,
            'U-441': 1,
            'M-296': 1,
            '潜甲': 1,
        }

        controller._handle_choose_fleet()
        self.assertIn('U-47', controller._state.ship_levels)
        self.assertEqual(fake_map.skill_clicks, 1)

    def test_target_fleet_complete_closes_and_buys_exp(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={'M-296': offer('M-296', 4)},
            score=10,
            phase=DecisivePhase.PREPARE_COMBAT,
        )
        fake_map.map_score = 10
        fake_map.map_level = 1
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor_level = 1
        controller._state.ship_levels = {
            'U-47': 1,
            'U-1206': 1,
            'U-96': 1,
            'U-81': 1,
            'U-1405': 1,
            '鲃鱼': 1,
        }

        controller._handle_choose_fleet()
        self.assertTrue(fake_map.closed)
        self.assertEqual(fake_map.bought, [])
        self.assertGreater(fake_map.exp_clicks, 0)
        self.assertEqual(controller._state.phase, DecisivePhase.PREPARE_COMBAT)

    def test_purchase_then_uses_remaining_points_for_exp(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={'U-47': offer('U-47', 4)},
            score=10,
            phase=DecisivePhase.PREPARE_COMBAT,
        )
        fake_map.map_score = 20
        fake_map.map_level = 1
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor_level = 1
        controller._state.ship_levels = {'U-1206': 1}

        controller._handle_choose_fleet()
        self.assertIn('U-47', fake_map.bought)
        self.assertGreater(fake_map.exp_clicks, 0)

    def test_choose_fleet_6_1_no_affordable_refreshes_then_closes(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={'捷尔任斯基': offer('捷尔任斯基', 5)},
            score=1,
        )
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'A'
        controller._handle_choose_fleet()
        self.assertEqual(fake_map.refreshed, 1)
        self.assertTrue(fake_map.closed)
        self.assertFalse(fake_map.first_called)
        self.assertEqual(controller._state.phase, DecisivePhase.PREPARE_COMBAT)

    def test_purchase_close_retreat_only_at_6_2_a(self) -> None:
        state, logic = self.make(stage=2, node='A')
        self.assertTrue(logic.should_retreat_after_purchase_close())
        state.stage = 2
        state.node = 'B'
        self.assertFalse(logic.should_retreat_after_purchase_close())
        state.stage = 1
        state.node = 'A'
        self.assertFalse(logic.should_retreat_after_purchase_close())

    def test_choose_fleet_6_2_no_affordable_refreshes_then_closes(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={'捷尔任斯基': offer('捷尔任斯基', 5)},
            score=1,
        )
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._handle_choose_fleet()
        self.assertEqual(fake_map.refreshed, 1)
        self.assertTrue(fake_map.closed)
        self.assertEqual(controller._state.phase, DecisivePhase.RETREAT)

    def test_buy_failure_refreshes_once_then_closes(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={'M-296': offer('M-296', 4)},
            score=4,
        )
        fake_map.buy_ok = False
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'C'
        controller._handle_choose_fleet()
        self.assertEqual(fake_map.refreshed, 1)
        self.assertTrue(fake_map.closed)
        self.assertEqual(controller._state.phase, DecisivePhase.PREPARE_COMBAT)

    def test_buy_failure_after_refresh_closes_without_second_refresh(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(
            offers={'M-296': offer('M-296', 4)},
            score=4,
        )
        fake_map.buy_ok = False
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'C'
        controller._state.refresh_count = 1
        controller._handle_choose_fleet()
        self.assertEqual(fake_map.refreshed, 0)
        self.assertTrue(fake_map.closed)
        self.assertEqual(controller._state.phase, DecisivePhase.PREPARE_COMBAT)

    def test_retreat_restores_snapshot(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(offers={})
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.score = 12
        controller._state.ship_levels = {'U-47': 1}
        controller._state.capture_stage_snapshot()

        controller._state.node = 'F'
        controller._state.score = 1
        controller._state.ship_levels = {'U-96': 1}
        controller._execute_retreat()
        self.assertTrue(fake_map.retreat_opened)
        self.assertTrue(fake_map.retreat_confirmed)
        self.assertEqual(controller._state.node, 'A')
        self.assertEqual(controller._state.score, 12)
        self.assertEqual(controller._state.ship_levels, {'U-47': 1})

    def test_node_result_keeps_unknown_u(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(offers={}, phase=DecisivePhase.PREPARE_COMBAT)
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'U'
        controller._handle_node_result()
        self.assertEqual(controller._state.node, 'U')
        self.assertTrue(fake_map.finished)

    def test_stage_end_uses_finish_stage_clear(self) -> None:
        controller = self.make_controller()
        fake_map = _FakeMap(offers={})
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'J'
        controller._handle_node_result()
        self.assertTrue(fake_map.cleared)
        self.assertEqual(controller._state.phase, DecisivePhase.STAGE_CLEAR)


class _FakePage:
    def __init__(self) -> None:
        self.ensured: list[str] | None = None
        self.repaired = False
        self.started = 0

    def ensure_fleet(self, fleet: list[str]) -> None:
        self.ensured = fleet

    def apply_full_repair(self) -> None:
        self.repaired = True

    def start_battle(self) -> None:
        self.started += 1


class _FakePrepareMap(_FakeMap):
    def __init__(
        self,
        *,
        level: int = 1,
        scores: list[int] | None = None,
        sortie_outcome: SortieOutcome = SortieOutcome.BATTLE,
        start_outcome: SortieOutcome = SortieOutcome.BATTLE,
        start_outcomes: list[SortieOutcome] | None = None,
    ) -> None:
        super().__init__(offers={}, phase=DecisivePhase.PREPARE_COMBAT)
        self.level = level
        self.scores = iter(scores or [])
        self.skill_clicks = 0
        self.buy_clicks = 0
        self.sortie_outcome = sortie_outcome
        self.start_outcome = start_outcome
        self._start_outcomes = iter(start_outcomes or [])
        self.current_fleet: list[str | None] = [None] * 6
        self.damage_cancelled = False
        self.entered = False
        self.page = _FakePage()

    def check_fleet(self) -> list[str | None]:
        return list(self.current_fleet)

    def read_skill_level(self, screen: object = None) -> int:
        return self.level

    def read_score(self, screen: object = None, map_page: bool = True):
        return next(self.scores, None)

    def click_skill(self) -> None:
        self.skill_clicks += 1

    def is_buy_exp_disabled(self, screen: object = None) -> bool:
        return False

    def click_buy_exp(self) -> None:
        self.buy_clicks += 1

    def drain_insufficient_popup(self) -> bool:
        return False

    def click_sortie_and_probe(self, timeout: float | None = None) -> SortieOutcome:
        return self.sortie_outcome

    def wait_for_start_outcome(self, timeout: float | None = None) -> SortieOutcome:
        return next(self._start_outcomes, self.start_outcome)

    def cancel_damage_confirm(self) -> None:
        self.damage_cancelled = True

    def enter_formation(self) -> _FakePage:
        self.entered = True
        return self.page

    def is_battle_ui(self, screen: object = None) -> bool:
        return True


class TestPrepareCombat(_Base):
    def make_controller(self, **config: object) -> DecisiveController:
        ctx = SimpleNamespace(
            ctrl=_FakeCtrl(),
            ocr=SimpleNamespace(),
            config=SimpleNamespace(decisive_battle=None),
            stop_event=threading.Event(),
            ship_registry={},
        )
        return DecisiveController(ctx, DecisiveConfig(chapter=6, **config))

    def test_full_fleet_zidiao_skill_buy_exp_then_quick_sortie(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=3, scores=[10, 5, 0])
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.instructor_level = 3
        controller._state.score = 10
        controller._state.ship_levels = {name: 1 for name in SUBS}
        controller._state.fleet = controller._logic.get_best_fleet()

        # 购买页已关闭后才释放技能；这里直接模拟该时机。
        controller._maybe_use_instructor_skill()
        controller._handle_prepare_combat()
        self.assertEqual(fake_map.skill_clicks, 1)
        self.assertEqual(fake_map.buy_clicks, 2)
        self.assertEqual(controller._state.instructor_level, 3)
        self.assertEqual(controller._state.skill_used_levels, {3})
        self.assertEqual(controller._state.score, 0)
        self.assertFalse(fake_map.entered)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_recovery_empty_fleet_keeps_purchased_ships(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=1)
        controller._map = fake_map
        controller._resume_mode = True
        controller._state.stage = 1
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {'考文垂': 1, 'U-1206': 1}

        controller._handle_prepare_combat()
        self.assertEqual(
            controller._state.ship_levels,
            {'考文垂': 1, 'U-1206': 1},
        )
        self.assertTrue(fake_map.entered)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_6_1_a_without_must_have_retreats(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=1)
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {'考文垂': 1}

        controller._handle_prepare_combat()
        self.assertFalse(fake_map.entered)
        self.assertEqual(controller._state.phase, DecisivePhase.RETREAT)

    def test_6_1_a_first_battle_does_not_click_full_repair(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=1)
        controller._map = fake_map
        controller._state.stage = 1
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {'考文垂': 1, 'U-1206': 1}

        controller._handle_prepare_combat()
        self.assertTrue(fake_map.entered)
        self.assertFalse(fake_map.page.repaired)
        self.assertEqual(fake_map.page.started, 1)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_partial_fleet_manual_without_popup_does_not_repair(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=1)
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {name: 1 for name in SUBS[:5]}

        controller._handle_prepare_combat()
        self.assertTrue(fake_map.entered)
        self.assertFalse(fake_map.page.repaired)
        self.assertEqual(fake_map.page.started, 1)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_manual_damage_popup_cancels_repairs_and_retries(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(
            level=1,
            start_outcomes=[SortieOutcome.DAMAGE_CONFIRM, SortieOutcome.BATTLE],
        )
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {name: 1 for name in SUBS[:5]}

        controller._handle_prepare_combat()
        self.assertTrue(fake_map.damage_cancelled)
        self.assertTrue(fake_map.page.repaired)
        self.assertEqual(fake_map.page.started, 2)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_stage3_j_kearsarge_skill_then_manual(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=1)
        controller._map = fake_map
        controller._state.stage = 3
        controller._state.node = 'J'
        controller._state.instructor = '奇尔沙治'
        controller._state.ship_levels = {name: 1 for name in SUBS}

        # 模拟 J 点购买页已关闭：此时才释放奇尔沙治技能。
        controller._maybe_use_kearsarge_skill()
        controller._handle_prepare_combat()
        self.assertEqual(fake_map.skill_clicks, 1)
        self.assertTrue(fake_map.entered)
        self.assertTrue(fake_map.page.repaired)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_damage_confirm_cancels_then_manual(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(
            level=1,
            sortie_outcome=SortieOutcome.DAMAGE_CONFIRM,
        )
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {name: 1 for name in SUBS}
        controller._state.fleet = controller._logic.get_best_fleet()

        controller._handle_prepare_combat()
        self.assertTrue(fake_map.damage_cancelled)
        self.assertTrue(fake_map.entered)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_flagship_severe_goes_manual_without_cancel(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(
            level=1,
            sortie_outcome=SortieOutcome.FLAGSHIP_SEVERE,
        )
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {name: 1 for name in SUBS}
        controller._state.fleet = controller._logic.get_best_fleet()

        controller._handle_prepare_combat()
        self.assertFalse(fake_map.damage_cancelled)
        self.assertTrue(fake_map.entered)
        self.assertTrue(fake_map.page.repaired)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_quick_sortie_still_map_without_popup_does_not_repair(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(
            level=1,
            sortie_outcome=SortieOutcome.STILL_MAP,
        )
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'
        controller._state.ship_levels = {name: 1 for name in SUBS}
        controller._state.fleet = controller._logic.get_best_fleet()

        controller._handle_prepare_combat()
        self.assertTrue(fake_map.entered)
        self.assertFalse(fake_map.page.repaired)
        self.assertEqual(controller._state.phase, DecisivePhase.IN_COMBAT)

    def test_empty_fleet_retreats(self) -> None:
        controller = self.make_controller()
        fake_map = _FakePrepareMap(level=1)
        controller._map = fake_map
        controller._state.stage = 2
        controller._state.node = 'A'
        controller._state.instructor = '紫貂'

        controller._handle_prepare_combat()
        self.assertFalse(fake_map.entered)
        self.assertEqual(controller._state.phase, DecisivePhase.RETREAT)


class TestEnterMapResetBranches(_Base):
    """P1-1：调用方必须区分 重置成功 / 船坞满 / 其它失败。"""

    def _enter_map(self, outcome: ChapterResetOutcome) -> tuple[DecisiveController, _FakeResetPage]:
        controller = make_controller()
        page = _FakeResetPage(outcome)
        controller._battle_page = page
        controller._state.stage_enter_snapshot = None
        controller._handle_enter_map()
        return controller, page

    def test_reset_success_enters_map(self) -> None:
        controller, page = self._enter_map(ChapterResetOutcome.RESET)
        self.assertTrue(page.entered)
        self.assertEqual(controller._state.stage, 1)
        self.assertEqual(controller._state.phase, DecisivePhase.WAITING_FOR_MAP)
        self.assertFalse(controller._resume_mode)

    def test_dock_full_goes_to_dock_full_phase(self) -> None:
        controller, page = self._enter_map(ChapterResetOutcome.DOCK_FULL)
        self.assertFalse(page.entered)
        self.assertEqual(controller._state.phase, DecisivePhase.DOCK_FULL)

    def test_other_failure_raises_instead_of_dock_full(self) -> None:
        with self.assertRaises(ChapterResetError) as caught:
            self._enter_map(ChapterResetOutcome.FAILED)
        self.assertIn('未变为', str(caught.exception))

    def test_failed_outcome_is_falsy_for_legacy_caller(self) -> None:
        self.assertFalse(ChapterResetOutcome.FAILED)
        self.assertFalse(ChapterResetOutcome.DOCK_FULL)
        self.assertTrue(ChapterResetOutcome.RESET)


class TestResetChapterPage(unittest.TestCase):
    """P1-1：reset_chapter 只有轮询到 REFRESHED 才算成功。"""

    def _page(self) -> DecisiveBattlePage:
        ctx = SimpleNamespace(
            ctrl=_FakeCtrl(),
            ocr=SimpleNamespace(),
            stop_event=threading.Event(),
        )
        return DecisiveBattlePage(ctx)

    def _reset(self, page: DecisiveBattlePage, **kwargs: object) -> ChapterResetOutcome:
        screen = np.zeros((540, 960, 3), dtype=np.uint8)
        with (
            patch('autowsgr.ui.decisive.battle_page.wait_for_stable_screen', return_value=screen),
            patch('autowsgr.ui.decisive.battle_page.confirm_operation') as confirm,
            patch('autowsgr.ui.decisive.battle_page.ImageChecker') as checker,
        ):
            confirm.return_value = not kwargs.pop('confirm_missing', False)
            checker.template_exists.return_value = bool(kwargs.pop('dock_full', False))
            return page.reset_chapter(**kwargs)  # type: ignore[arg-type]

    def test_returns_reset_after_polling_to_refreshed(self) -> None:
        page = self._page()
        statuses = [
            DecisiveEntryStatus.REFRESH,
            DecisiveEntryStatus.REFRESH,
            DecisiveEntryStatus.REFRESHED,
        ]
        page.detect_entry_status = lambda **kwargs: statuses.pop(0)
        outcome = self._reset(page, timeout=5.0, interval=0.01)
        self.assertIs(outcome, ChapterResetOutcome.RESET)
        self.assertEqual(statuses, [])

    def test_returns_dock_full_without_confirm(self) -> None:
        page = self._page()
        page.detect_entry_status = lambda **kwargs: DecisiveEntryStatus.REFRESH
        outcome = self._reset(page, dock_full=True)
        self.assertIs(outcome, ChapterResetOutcome.DOCK_FULL)

    def test_missing_confirm_button_is_failed(self) -> None:
        page = self._page()
        page.detect_entry_status = lambda **kwargs: DecisiveEntryStatus.REFRESH
        outcome = self._reset(page, confirm_missing=True)
        self.assertIs(outcome, ChapterResetOutcome.FAILED)

    def test_timeout_still_refresh_returns_failed(self) -> None:
        page = self._page()
        page.detect_entry_status = lambda **kwargs: DecisiveEntryStatus.REFRESH
        outcome = self._reset(page, timeout=0.0, interval=0.01)
        self.assertIs(outcome, ChapterResetOutcome.FAILED)
        self.assertFalse(outcome)


if __name__ == '__main__':
    unittest.main()
