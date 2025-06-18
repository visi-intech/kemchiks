/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useState } from "@odoo/owl";

//
// ===============================
// 🎯 1️⃣ POPUP NUMERIC KEYBOARD
// ===============================
export class NumericKeyboardPopup extends AbstractAwaitablePopup {
    static template = "integrasi_pos.NumericKeyboardPopup";
    static defaultProps = {
        confirmText: "OK",
        cancelText: "Batal",
        title: "Input Angka",
        maxLength: 4,
        placeholder: "0000",
        body: ""
    };
    setup() {
        super.setup();
        this.state = useState({
            inputValue: "",
            error: ""
        });
    }
    onKeyPress(key) {
        if (key === "backspace") {
            this.state.inputValue = this.state.inputValue.slice(0, -1);
        } else if (key === "clear") {
            this.state.inputValue = ""; 
        } else if (this.state.inputValue.length < this.props.maxLength) {
            this.state.inputValue += key;
        }
        this.state.error = ""; 
    }
    getPayload() {
        if (this.state.inputValue.length !== this.props.maxLength) {
            this.state.error = `Input harus tepat ${this.props.maxLength} digit`;
            return null;
        }
        return this.state.inputValue;
    }
    confirm() {
        const payload = this.getPayload();
        if (payload) {
            super.confirm();
        }
    }
}

//
// ===============================
// 🎯 2️⃣ TRIGGER PRINT KE KASIR
// ===============================
async function triggerPrinter(orderData) {
    const res = await fetch("http://localhost:3000/print-receipt", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ order: orderData })
    });
    if (!res.ok) {
        throw new Error("Gagal cetak struk");
    }
    return await res.text();
}

//
// ===============================
// 🎯 3️⃣ TRIGGER OPEN DRAWER
// ===============================
async function openCashDrawer() {
    const res = await fetch("http://localhost:3000/open-drawer?brand=Epson");
    if (!res.ok) {
        throw new Error("Gagal buka cash drawer");
    }
    return await res.text();
}

//
// ===============================
// 🎯 4️⃣ PATCH PAYMENT SCREEN
// ===============================
patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        const result = this.currentOrder.add_paymentline(paymentMethod);

        if (!this.pos.get_order().check_paymentlines_rounding()) {
            this._display_popup_error_paymentlines_rounding();
        }

        if (result) {
            this.numberBuffer.reset();

            if (paymentMethod.type === "cash") {
                try {
                    await openCashDrawer();
                    console.log("[POS] 💵 Cash drawer opened (CASH).");
                } catch (error) {
                    console.error("[POS] ❌ Gagal buka cash drawer:", error);
                    await this.popup.add(ErrorPopup, {
                        title: "Error",
                        body: "Gagal membuka cash drawer. Pastikan service Node.js aktif.",
                    });
                    return false;
                }
            } else {
                // ✅ Pembayaran Kartu: Popup 4 Digit
                const { confirmed, payload } = await this.popup.add(NumericKeyboardPopup, {
                    title: "Input 4 Digit Terakhir Kartu",
                    maxLength: 4,
                    placeholder: "Contoh: 1234",
                    body: "Masukkan 4 digit terakhir dari nomor kartu"
                });

                if (confirmed && payload) {
                    const paymentLine = this.currentOrder.selected_paymentline;
                    if (paymentLine) {
                        paymentLine.card_number = payload;
                    }
                    console.log("[POS] 💳 Nomor kartu debit tersimpan:", payload);
                } else if (!confirmed) {
                    // User membatalkan, hapus payment line
                    const paymentLine = this.currentOrder.selected_paymentline;
                    if (paymentLine) {
                        this.currentOrder.remove_paymentline(paymentLine);
                    }
                    return false;
                }
            }
            return true;

        } else {
            await this.popup.add(ErrorPopup, {
                title: "Error",
                body: "There is already an electronic payment in progress.",
            });
            return false;
        }
    },
});
