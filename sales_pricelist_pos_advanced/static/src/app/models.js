/** @odoo-module */

import { ProductTemplate } from "@point_of_sale/app/models/product_template";
import { patch } from "@web/core/utils/patch";
import { roundPrecision } from "@web/core/utils/numbers";

/**
 * Port of product.pricelist.item._asp_apply_formula (Python): standard Odoo 20
 * discount / surcharge computation extended with the percentage extra fee.
 * Order: discount (or markup on cost) -> rounding -> extra fees -> min/max margins.
 */
export function aspApplyFormula(rule, basePrice) {
    const priceLimit = basePrice;
    // A surcharge (markup) is stored as price_discount = -markup.
    let price = basePrice - basePrice * ((rule.price_discount || 0) / 100);
    if (rule.price_round) {
        price = roundPrecision(price, rule.price_round);
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

patch(ProductTemplate.prototype, {
    /**
     * Same rule selection as ProductTemplateAccounting.getPrice (Odoo 20):
     * variant rules, then template, category and global rules.
     */
    _aspGetRule(pricelist, quantity, variant) {
        if (!pricelist) {
            return null;
        }
        const productTmpl = variant?.product_tmpl_id || this;
        let rule = null;
        if (variant) {
            rule = pricelist.findBestRule(pricelist.getRulesByProductId(variant.id), quantity);
        }
        if (!rule) {
            rule = pricelist.findBestRule(pricelist.getRulesByTmplId(productTmpl.id), quantity);
        }
        if (!rule) {
            const ids = pricelist.getCategoryRulesIds(this.parentCategories);
            if (ids.length) {
                rule = pricelist.findBestRule(this.models["product.pricelist.item"].readMany(ids), quantity);
            }
        }
        if (!rule) {
            const ids = pricelist.getGlobalRulesIds();
            if (ids.length) {
                rule = pricelist.findBestRule(this.models["product.pricelist.item"].readMany(ids), quantity);
            }
        }
        return rule;
    },

    getPrice(
        pricelist,
        quantity,
        price_extra = 0,
        recurring = false,
        variant = false,
        original_line = false,
        related_lines = []
    ) {
        const rule = this._aspGetRule(pricelist, quantity, variant);
        if (!rule || rule.compute_price === "fixed" || !rule.price_surcharge_percent) {
            return super.getPrice(...arguments);
        }
        // Base price, exactly as in ProductTemplateAccounting.getPrice (Odoo 20)
        const standardPrice = variant ? variant.standard_price : this.standard_price;
        let price = (variant ? variant.lst_price : this.list_price) + (price_extra || 0);
        if (rule.base === "pricelist") {
            if (rule.base_pricelist_id) {
                price = this.getPrice(rule.base_pricelist_id, quantity, price_extra, true, variant);
            }
        } else if (rule.base === "standard_price") {
            price = standardPrice;
        }
        const posCurrency = this.config.currency_id;
        const pricelistCurrency = pricelist.currency_id;
        const convert = pricelistCurrency && posCurrency && pricelistCurrency.id !== posCurrency.id;
        if (convert) {
            price *= pricelistCurrency.rate / posCurrency.rate;
        }
        price = aspApplyFormula(rule, price);
        if (convert) {
            price *= posCurrency.rate / pricelistCurrency.rate;
        }
        return price;
    },
});
