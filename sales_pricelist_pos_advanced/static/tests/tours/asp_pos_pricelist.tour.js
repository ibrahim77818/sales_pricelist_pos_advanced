/** @odoo-module */
/* global posmodel */

import { registry } from "@web/core/registry";
import { roundDecimals as round_di } from "@web/core/utils/numbers";

// [product name, pricelist name, quantity, expected price] -- expected values
// are computed by the backend engine in test_pos_ui.py (same scenarios).
const CASES = [
    ["ASP POS Fee Product", "ASP POS Fee on base", 1, 95.0],
    ["ASP POS Fee Product", "ASP POS Fee on discounted", 1, 94.5],
    ["ASP POS Fee Product", "ASP POS Fee rounded", 1, 104.5],
    ["ASP POS Fee Product", "ASP POS Fee on cost", 1, 67.0],
    ["ASP POS Fee Product", "ASP POS Fee capped", 1, 120.0],
    ["ASP POS Fee Product", "ASP POS Fee chained", 1, 99.75],
    ["ASP POS Fee Product", "ASP POS Fee min qty", 1, 100.0],
    ["ASP POS Fee Product", "ASP POS Fee min qty", 10, 110.0],
    ["ASP POS Fee Product", "ASP POS No fee", 1, 90.0],
];

registry.category("web_tour.tours").add("asp_pos_percent_fee_tour", {
    test: true,
    url: "/pos/ui",
    steps: () => [
        {
            content: "Wait for the POS to be loaded",
            extra_trigger: "body .pos:not(:has(.loader))",
            trigger: "body:not(:has(.o_loading_indicator))",
            run: function () {
                const errors = [];
                for (const [productName, pricelistName, qty, expected] of CASES) {
                    const product = posmodel.db.search_product_in_category(0, productName)[0];
                    const pricelist = posmodel.pricelists.find((pl) => pl.name === pricelistName);
                    if (!product || !pricelist) {
                        errors.push(`missing data: ${productName} / ${pricelistName}`);
                        continue;
                    }
                    const price = round_di(product.get_price(pricelist, qty), posmodel.dp["Product Price"]);
                    if (Math.abs(price - expected) > 0.001) {
                        errors.push(`${pricelistName} x${qty}: ${price} != ${expected}`);
                    }
                }
                if (errors.length) {
                    throw new Error("ASP POS price mismatch: " + errors.join(" | "));
                }
            },
        },
        {
            content: "Prices checked",
            trigger: ".pos",
            run: function () {},
        },
    ],
});
