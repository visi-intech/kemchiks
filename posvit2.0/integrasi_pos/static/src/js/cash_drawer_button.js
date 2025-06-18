/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

export class CashDrawerButton extends Component {
    static template = "CashDrawerButton";
    static props = { label: { type: String, optional: true } };
    setup() {
        this.popup = useService("popup");
        this.pos = usePos();
        this.label = this.props.label || _t("Cash Drawer");
    }

    async onClick() {
        try {
            // ✅ Panggil Node.js service untuk buka drawer
            const response = await fetch("http://localhost:3000/open-drawer?brand=Epson");

            if (!response.ok) {
                throw new Error(`Gagal buka drawer: ${response.statusText}`);
            }

            const result = await response.text();
            console.log("[🧑‍💻 POS] ✅ Cash drawer opened:", result);
        } catch (error) {
            console.error("[🧑‍💻 POS] ❌ Failed to open cash drawer:", error);
            this.popup.add(ErrorPopup, {
                title: _t("Error"),
                body: _t("Unable to open the cash drawer. Periksa koneksi dengan service Node.js."),
            });
        }
    }
}

// ⚡️ Tambahkan tombol ke layar produk
ProductScreen.addControlButton({
    component: CashDrawerButton,
    condition: () => true,
    position: ["before", "SetPriceButton"],
});
