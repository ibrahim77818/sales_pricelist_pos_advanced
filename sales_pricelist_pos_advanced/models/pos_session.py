# -*- coding: utf-8 -*-
from odoo import models

GENERIC = '2_any'


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _product_pricelist_item_fields(self):
        fields = super()._product_pricelist_item_fields()
        extra = ['asp_target', 'price_surcharge_percent', 'price_surcharge_percent_base']
        return fields + [fname for fname in extra if fname not in fields]

    @staticmethod
    def _asp_generic_items(items):
        """The POS client only sells in the product UoM and has no packaging
        context: UoM / packaging targeted rules must never reach it."""
        return [item for item in items if item.get('asp_target', GENERIC) == GENERIC]

    def _get_pos_ui_product_pricelist(self, params):
        pricelists = super()._get_pos_ui_product_pricelist(params)
        for pricelist in pricelists:
            pricelist['items'] = self._asp_generic_items(pricelist.get('items', []))
        return pricelists

    def get_pos_ui_product_pricelist_item_by_product(self, product_tmpl_ids, product_ids):
        items = super().get_pos_ui_product_pricelist_item_by_product(product_tmpl_ids, product_ids)
        return self._asp_generic_items(items)
