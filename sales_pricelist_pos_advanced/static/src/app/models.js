/** @odoo-module */

import { Product } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";
import { roundPrecision as round_pr } from "@web/core/utils/numbers";

const { DateTime } = luxon;

/**
 * Port of product.pricelist.item._asp_apply_formula (Python): standard Odoo
 * formula extended with the percentage extra fee.
 * Order: discount -> rounding -> extra fees -> min/max margins.
 */
export function aspApplyFormula(rule, basePrice) {
    const priceLimit = basePrice;
    let price = basePrice - basePrice * (rule.price_discount / 100);
    if (rule.price_round) {
        price = round_pr(price, rule.price_round);
    }
    const discountedPrice = price;
    if (rule.price_surcharge) {
        price += rule.price_surcharge;
    }
    if (rule.price_surcharge_percent) {
        const feeBasis = rule.price_surcharge_percent_base === "discounted" ? discountedPrice : basePrice;
        price += (feeBasis * rule.price_surcharge_percent) / 100;
    }
    if (rule.price_min_margin) {
        price = Math.max(price, priceLimit + rule.price_min_margin);
    }
    if (rule.price_max_margin) {
        price = Math.min(price, priceLimit + rule.price_max_margin);
    }
    return price;
}

patch(Product.prototype, {
    /**
     * Same rule selection as Product.get_price (Odoo 17): first usable rule
     * (items are sorted by the server) whose minimum quantity is reached.
     * Lot-tracked lines use the quantity of all lines of the product, as in
     * the standard method; computed here without touching `related_lines`.
     */
    _aspGetRule(pricelist, quantity, original_line) {
        if (!pricelist) {
            return undefined;
        }
        const date = DateTime.now();
        const items = (this.applicablePricelistItems[pricelist.id] || []).filter((item) =>
            this.isPricelistItemUsable(item, date)
        );
        if (original_line && original_line.is_lot_tracked()) {
            quantity = original_line.order.orderlines
                .filter((line) => line.product.id === this.id)
                .reduce((sum, line) => sum + line.get_quantity(), 0);
        }
        return items.find((rule) => !rule.min_quantity || quantity >= rule.min_quantity);
    },

    get_price(pricelist, quantity, price_extra = 0, recurring = false, original_line = false, related_lines = []) {
        const rule = this._aspGetRule(pricelist, quantity, original_line);
        if (!rule || rule.compute_price !== "formula" || !rule.price_surcharge_percent) {
            return super.get_price(...arguments);
        }
        // Base price, exactly as in Product.get_price
        let price = this.lst_price + (price_extra || 0);
        if (rule.base === "pricelist") {
            const basePricelist = this.pos.pricelists.find(
                (pl) => pl.id === rule.base_pricelist_id[0]
            );
            if (basePricelist) {
                price = this.get_price(basePricelist, quantity, 0, true);
            }
        } else if (rule.base === "standard_price") {
            price = this.standard_price;
        }
        return aspApplyFormula(rule, price);
    },
});
