/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Order } from "@point_of_sale/app/store/models";

patch(Order.prototype, {
    _applyReward(reward, coupon_id, args) {
        // ⛔ Jangan terapkan reward jika ini adalah refund order
        if (this.is_refund_order) {
            return false;
        }

        if (!this.pos.config.validate_member_schedule) {
            return super._applyReward?.(reward, coupon_id, args);
        }

        if (!reward || !reward.program_id) {
            console.warn(`⚠️ Reward tidak valid atau tidak memiliki program_id`, reward);
            return false;
        }

        const now = new Date();
        const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const program = reward.program_id;

        const schedules = this.pos.loyalty_schedules.filter(s => {
            const [pid] = Array.isArray(s.program_id) ? s.program_id : [s.program_id?.id];
            return pid === program.id &&
                s.days === currentDay &&
                s.time_start <= currentHour &&
                currentHour <= s.time_end;
        });

        const isScheduleValid = schedules.length > 0 || !this.pos.loyalty_schedules.some(s => {
            const [pid] = Array.isArray(s.program_id) ? s.program_id : [s.program_id?.id];
            return pid === program.id;
        });

        const partner = this.get_partner();
        const categoryIds = Array.isArray(partner?.category_id) ? partner.category_id : [];
        const partnerCategoryIds = categoryIds.map(id => typeof id === "number" ? id : id[0]);

        let isMemberValid = false;
        const programHasMembers = this.pos.loyalty_members.some(member => {
            const programId = Array.isArray(member.member_program_id)
                ? member.member_program_id[0]
                : member.member_program_id;
            return programId === program.id;
        });

        for (const member of this.pos.loyalty_members) {
            const programId = Array.isArray(member.member_program_id)
                ? member.member_program_id[0]
                : member.member_program_id;
            const memberCategoryId = Array.isArray(member.member_pos)
                ? member.member_pos[0]
                : member.member_pos;

            if (programId === program.id) {
                if (!memberCategoryId || partnerCategoryIds.includes(memberCategoryId)) {
                    isMemberValid = true;
                    break;
                }
            }
        }

        const allowReward = (!programHasMembers || isMemberValid) && isScheduleValid;

        if (!allowReward) {
            console.log(`🚫 Reward "${reward.name}" tidak memenuhi syarat program "${program.name}".`);
            return false;
        }

        const result = super._applyReward(reward, coupon_id, args);
        if (result === true) {
            console.log(`✅ Reward "${reward.name}" dari program "${program.name}" berhasil diterapkan.`);
            this._reorderRewardLines();
        }

        return result;
    },

    _updateRewardLines() {
        // 🛑 Skip saat refund agar orderline tidak dihapus
        if (this.is_refund_order) {
            return;
        }

        if (!this.pos.config.validate_member_schedule) {
            return super._updateRewardLines?.(...arguments);
        }

        const rewardLines = this._get_reward_lines();

        for (const line of rewardLines) {
            const reward = this.pos.reward_by_id[line.reward_id];
            if (!reward || !reward.program_id) {
                console.warn(`⚠️ Reward dengan ID "${line.reward_id}" tidak valid. Dihapus.`);
                this.orderlines.remove(line);
                continue;
            }

            const program = reward.program_id;
            const now = new Date();
            const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
            const currentHour = now.getHours() + now.getMinutes() / 60;

            const schedules = this.pos.loyalty_schedules.filter(s => {
                const [pid] = Array.isArray(s.program_id) ? s.program_id : [s.program_id?.id];
                return pid === program.id &&
                    s.days === currentDay &&
                    s.time_start <= currentHour &&
                    currentHour <= s.time_end;
            });

            const isScheduleValid = schedules.length > 0 || !this.pos.loyalty_schedules.some(s => {
                const [pid] = Array.isArray(s.program_id) ? s.program_id : [s.program_id?.id];
                return pid === program.id;
            });

            const partner = this.get_partner();
            const categoryIds = Array.isArray(partner?.category_id) ? partner.category_id : [];
            const partnerCategoryIds = categoryIds.map(id => typeof id === "number" ? id : id[0]);

            let isMemberValid = false;
            const programHasMembers = this.pos.loyalty_members.some(member => {
                const programId = Array.isArray(member.member_program_id)
                    ? member.member_program_id[0]
                    : member.member_program_id;
                return programId === program.id;
            });

            for (const member of this.pos.loyalty_members) {
                const programId = Array.isArray(member.member_program_id)
                    ? member.member_program_id[0]
                    : member.member_program_id;
                const memberCategoryId = Array.isArray(member.member_pos)
                    ? member.member_pos[0]
                    : member.member_pos;

                if (programId === program.id) {
                    if (!memberCategoryId || partnerCategoryIds.includes(memberCategoryId)) {
                        isMemberValid = true;
                        break;
                    }
                }
            }

            const allowReward = (!programHasMembers || isMemberValid) && isScheduleValid;

            if (!allowReward) {
                console.log(`⚠️ Reward "${reward.name}" dihapus dari garis reward karena jadwal/keanggotaan tidak valid.`);
                this.orderlines.remove(line);
            }
        }

        this._reorderRewardLines();
    },

    async _updateRewards() {
        // ⛔ Jangan proses ulang reward saat refund
        if (this.is_refund_order) {
            return;
        }

        if (!this.pos.config.validate_member_schedule) {
            return await super._updateRewards?.(...arguments);
        }

        await super._updateRewards(...arguments);

        const now = new Date();
        const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
        const currentHour = now.getHours() + now.getMinutes() / 60;

        const rewardLines = this._get_reward_lines();
        for (const line of rewardLines) {
            const reward = this.pos.reward_by_id[line.reward_id];
            if (!reward || !reward.program_id) {
                console.warn(`⚠️ Reward tidak valid ditemukan di updateRewards`, reward);
                this.orderlines.remove(line);
                continue;
            }

            const program = reward.program_id;

            const schedules = this.pos.loyalty_schedules.filter(s => {
                const [pid] = Array.isArray(s.program_id) ? s.program_id : [s.program_id?.id];
                return pid === program.id &&
                    s.days === currentDay &&
                    s.time_start <= currentHour &&
                    currentHour <= s.time_end;
            });

            const isScheduleValid = schedules.length > 0 || !this.pos.loyalty_schedules.some(s => {
                const [pid] = Array.isArray(s.program_id) ? s.program_id : [s.program_id?.id];
                return pid === program.id;
            });

            const partner = this.get_partner();
            const categoryIds = Array.isArray(partner?.category_id) ? partner.category_id : [];
            const partnerCategoryIds = categoryIds.map(id => typeof id === "number" ? id : id[0]);

            let isMemberValid = false;
            const programHasMembers = this.pos.loyalty_members.some(member => {
                const programId = Array.isArray(member.member_program_id)
                    ? member.member_program_id[0]
                    : member.member_program_id;
                return programId === program.id;
            });

            for (const member of this.pos.loyalty_members) {
                const programId = Array.isArray(member.member_program_id)
                    ? member.member_program_id[0]
                    : member.member_program_id;
                const memberCategoryId = Array.isArray(member.member_pos)
                    ? member.member_pos[0]
                    : member.member_pos;

                if (programId === program.id) {
                    if (!memberCategoryId || partnerCategoryIds.includes(memberCategoryId)) {
                        isMemberValid = true;
                        break;
                    }
                }
            }

            const allowReward = (!programHasMembers || isMemberValid) && isScheduleValid;

            if (!allowReward) {
                console.log(`⚠️ Reward "${reward.name}" dihapus karena jadwal atau keanggotaan tidak valid.`);
                this.orderlines.remove(line);
            }
        }

        this._reorderRewardLines();
    },

    _reorderRewardLines() {
        if (!this.pos.config.validate_member_schedule) {
            return super._reorderRewardLines?.(...arguments);
        }

        const lines = [...this.orderlines];
        const mainProducts = [];
        const rewardLines = [];

        for (const line of lines) {
            const name = line.get_full_product_name();
            const price = line.get_price_with_tax();

            if (price < 0 || name.toLowerCase().includes("per point on")) {
                rewardLines.push(line);
            } else {
                mainProducts.push(line);
            }
        }

        const reordered = [];
        for (const productLine of mainProducts) {
            reordered.push(productLine);
            const related = rewardLines.filter((r) =>
                r.get_full_product_name().includes(productLine.get_full_product_name())
            );
            reordered.push(...related);
        }

        this.orderlines.reset();
        for (const line of reordered) {
            this.orderlines.add(line);
        }
    },

    _getGlobalDiscountLines() {
        if (!this.pos.config.validate_member_schedule) {
            return super._getGlobalDiscountLines?.(...arguments);
        }
        return this.orderlines.filter(l => l.reward?.is_global_discount);
    },
});
