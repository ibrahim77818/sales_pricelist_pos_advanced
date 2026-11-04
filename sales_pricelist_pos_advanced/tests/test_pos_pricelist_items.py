# -*- coding: utf-8 -*-
from odoo.tests import tagged

from odoo.addons.sales_pricelist_advanced.tests.common import AspCommon


@tagged('post_install', '-at_install', 'asp')
class TestPosPricelistItems(AspCommon):

    def test_targeted_rules_not_sent_to_pos(self):
        generic = self._product_item(fixed_price=9.5)
        self._product_item(packaging_id=self.carton.id, fixed_price=216.0)
        self._product_item(uom_id=self.uom_dozen.id, fixed_price=100.0)
        params = {'search_params': {
            'domain': [('id', '=', self.pricelist.id)],
            'fields': ['name', 'display_name', 'discount_policy'],
        }}
        pricelists = self.env['pos.session']._get_pos_ui_product_pricelist(params)
        self.assertEqual(len(pricelists), 1)
        self.assertEqual([item['id'] for item in pricelists[0]['items']], [generic.id])

    def test_backend_pricing_unchanged(self):
        self._product_item(packaging_id=self.carton.id, fixed_price=216.0)
        line = self._line(self._order(), qty=24, packaging=self.carton)
        self.assertAlmostEqual(line.price_unit, 9.0, places=6)
