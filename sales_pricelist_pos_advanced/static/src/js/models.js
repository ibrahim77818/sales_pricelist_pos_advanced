odoo.define('sales_pricelist_pos_advanced.models', function (require) {
"use strict";

const { Product } = require('point_of_sale.models');
const Registries = require('point_of_sale.Registries');
const utils = require('web.utils');

const round_pr = utils.round_precision;

/**
 * Port of product.pricelist.item._asp_apply_formula (Python): standard Odoo
 * formula extended with the percentage extra fee.
 * Order: discount -> rounding -> extra fees -> min/max margins.
 */
function aspApplyFormula(rule, basePrice) {
    const priceLimit = basePrice;
    let price = basePrice - (basePrice * (rule.price_discount / 100));
    if (rule.price_round) {
        price = round_pr(price, rule.price_round);
    }
    const discountedPrice = price;
    if (rule.price_surcharge) {
        price += rule.price_surcharge;
    }
    if (rule.price_surcharge_percent) {
        const feeBasis = rule.price_surcharge_percent_base === 'discounted' ? discountedPrice : basePrice;
        price += feeBasis * rule.price_surcharge_percent / 100;
    }
    if (rule.price_min_margin) {
        price = Math.max(price, priceLimit + rule.price_min_margin);
    }
    if (rule.price_max_margin) {
        price = Math.min(price, priceLimit + rule.price_max_margin);
    }
    return price;
}

const AspProduct = (Product) => class AspProduct extends Product {
    /**
     * Same rule selection as Product.get_price: first usable rule (items are
     * already sorted by the server) whose minimum quantity is reached.
     */
    _aspGetRule(pricelist, quantity) {
        const date = moment();
        const items = (this.applicablePricelistItems && this.applicablePricelistItems[pricelist.id]) || [];
        return items.find((rule) =>
            this.isPricelistItemUsable(rule, date) && !(rule.min_quantity && quantity < rule.min_quantity)
        );
    }

    get_price(pricelist, quantity, price_extra) {
        const rule = pricelist && this._aspGetRule(pricelist, quantity);
        if (!rule || rule.compute_price !== 'formula' || !rule.price_surcharge_percent) {
            return super.get_price(...arguments);
        }
        // Base price, exactly as in Product.get_price
        let price = this.lst_price;
        if (price_extra) {
            price += price_extra;
        }
        if (rule.base === 'pricelist') {
            const basePricelist = this.pos.pricelists.find((pl) => pl.id === rule.base_pricelist_id[0]);
            if (basePricelist) {
                price = this.get_price(basePricelist, quantity);
            }
        } else if (rule.base === 'standard_price') {
            price = this.standard_price;
        }
        return aspApplyFormula(rule, price);
    }
};
Registries.Model.extend(Product, AspProduct);

return { aspApplyFormula, AspProduct };
});
