(() => {
	"use strict";

	function upload_staged_card_image(file, side) {
		return new Promise((resolve, reject) => {
			const form_data = new FormData();
			form_data.append("file", file, file.name);
			form_data.append("side", side || "front");

			$.ajax({
				url: "/api/method/archive.api.cards.stage_card_image",
				type: "POST",
				data: form_data,
				processData: false,
				contentType: false,
				headers: {
					"X-Frappe-CSRF-Token": frappe.csrf_token,
				},
				success: (res) => {
					if (res && res.message) {
						resolve(res.message);
					} else {
						reject(new Error("استجابة غير متوقعة من الخادم."));
					}
				},
				error: (xhr) => {
					let msg = "تعذر رفع صورة البطاقة.";
					try {
						const parsed = JSON.parse(xhr.responseText || "{}");
						if (parsed._server_messages) {
							const msgs = JSON.parse(parsed._server_messages);
							if (msgs.length) {
								const first = JSON.parse(msgs[0]);
								msg = first.message || msg;
							}
						} else if (parsed.message) {
							msg = parsed.message;
						}
					} catch (_) {
						// fallback
					}
					reject(new Error(msg));
				},
			});
		});
	}

	class ArchiveCardCreateDialog {
		constructor(options = {}) {
			this.masters = options.masters || {};
			this.permissions = options.permissions || {};
			this.on_created = options.on_created || null;

			this.dialog = null;
			this.controls = {};
			this.staged_files = {
				front: null,
				back: null,
			};
			this.original_staged_files = {
				front: null,
				back: null,
			};
			this.preview_urls = {
				front: null,
				back: null,
			};
			this.original_preview_urls = {
				front: null,
				back: null,
			};
			this.edit_metas = {
				front: null,
				back: null,
			};
			this.all_staged_file_ids = new Set();
			this.saved_successfully = false;
			this.is_submitting = false;
			this.duplicate_family_info = null;
			this._dup_info_cache = new Map();
			this._dup_check_timer = null;
			this._dup_check_seq = 0;
			this.family_autocomplete = null;
			this.pin_visible = false;
		}

		show() {
			this.dialog = new frappe.ui.Dialog({
				title: "إضافة بطاقة جديدة",
				size: "extra-large",
				primary_action_label: "حفظ البطاقة",
				primary_action: () => {
					this.handle_submit();
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => {
					this.dialog.hide();
				},
			});

			this.dialog.$wrapper.addClass("archive-card-create-modal");
			this.render_body();
			this.bind_events();

			this.dialog.onhide = () => {
				clearTimeout(this._dup_check_timer);
				this.family_autocomplete?.destroy();
				this.family_autocomplete = null;
				this.cleanup_unused_staged_files();
			};

			this.dialog.show();
		}

		render_body() {
			const $body = $(this.dialog.body);
			$body.empty().attr("dir", "rtl").html(`
				<div class="archive-card-dialog-shell" dir="rtl">
					<div class="acd-duplicate-banner" data-role="duplicate-banner" hidden></div>

					<div class="acd-grid-layout">
						<div class="acd-form-column">
							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">بيانات البطاقة</span>
									<span class="ac-copy-badge acd-copy-pill" data-role="copy-badge">نسخة 1</span>
								</div>
								<div class="acd-fields-grid acd-cols-2">
									<div class="acd-field-slot" data-field-slot="base_card_name"></div>
									<div class="acd-field-slot" data-field-slot="bank"></div>
									<div class="acd-field-slot" data-field-slot="account_number"></div>
									<div class="acd-field-slot" data-field-slot="card_number"></div>
								</div>
								<div class="acd-derived-name-hint" data-role="derived-name-hint" hidden></div>
							</div>

							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">بيانات المندوب والمالك</span>
								</div>
								<div class="acd-fields-grid acd-cols-3">
									<div class="acd-field-slot" data-field-slot="card_owner"></div>
									<div class="acd-field-slot" data-field-slot="daily_limit"></div>
									<div class="acd-field-slot" data-field-slot="received_date"></div>
									<div class="acd-field-slot" data-field-slot="representative"></div>
									<div class="acd-field-slot" data-field-slot="region"></div>
								</div>
							</div>

							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">الرقم السري وحالة البطاقة</span>
								</div>
								<div class="acd-fields-grid acd-cols-2">
									<div class="acd-pin-field-wrapper">
										<label class="control-label reqd">الرقم السري (PIN)</label>
										<div class="acd-pin-input-group">
											<input
												type="password"
												class="form-control acd-pin-input"
												data-role="pin-input"
												placeholder="أدخل الرقم السري (4 أرقام)"
												inputmode="numeric"
												autocomplete="new-password"
											/>
											<button
												type="button"
												class="btn btn-default acd-pin-toggle-btn"
												data-action="toggle-pin"
												title="إظهار / إخفاء الرقم السري"
											>
												<i class="fa fa-eye"></i>
											</button>
										</div>
										<div class="acd-field-help">يُحفظ مشفراً ولا يظهر إلا لصاحب الصلاحية.</div>
									</div>
									<div class="acd-field-slot" data-field-slot="status"></div>
								</div>
								<div class="acd-field-slot" data-field-slot="status_reason" hidden style="margin-top: 10px;"></div>
							</div>
						</div>

						<div class="acd-images-column">
							<div class="acd-section-card acd-images-section">
								<div class="acd-section-header">
									<span class="acd-section-title">صور البطاقة</span>
									<span class="acd-section-subtitle">JPG / PNG / WEBP — بحد أقصى 10MB</span>
								</div>

								<div class="acd-image-slots-stack">
									${this.render_image_dropzone("front", "صورة الوجه الأمامي", true)}
									${this.render_image_dropzone("back", "صورة الوجه الخلفي (اختياري)", false)}
								</div>
							</div>
						</div>
					</div>
				</div>
			`);

			this.make_controls($body);
		}

		can_preview_images() {
			if (this.permissions && typeof this.permissions.can_preview_card_images === "boolean") {
				return this.permissions.can_preview_card_images;
			}
			return Boolean(frappe?.user?.has_role?.("صلاحية معاينة البطائق"));
		}

		render_image_dropzone(side, label, required = true) {
			const can_preview = this.can_preview_images();
			return `
				<div class="acd-image-slot-card" data-image-slot="${side}">
					<div class="acd-image-slot-header">
						<span class="acd-image-slot-label ${required ? "reqd" : ""}">${label}</span>
						<div class="acd-image-slot-actions">
							<button type="button" class="btn btn-xs btn-default" data-action="pick-image" data-side="${side}">
								<i class="fa fa-upload"></i> اختيار صورة
							</button>
							${
								can_preview
									? `<button type="button" class="btn btn-xs btn-default acd-slot-preview-edit-btn" data-action="preview-edit-image" data-side="${side}" hidden>
										<i class="fa fa-sliders"></i> معاينة
									</button>`
									: ""
							}
							<button type="button" class="btn btn-xs btn-default" data-action="zoom-staged" data-side="${side}" hidden>
								<i class="fa fa-search-plus"></i> تكبير
							</button>
						</div>
					</div>
					<div class="acd-card-aspect-frame" data-action="frame-click" data-side="${side}">
						<div class="acd-image-empty-state" data-role="empty-${side}">
							<i class="fa fa-credit-card"></i>
							<span>اضغط لرفع ${label}</span>
							<small>نسبة أبعاد البطاقة القياسية 1.586:1</small>
						</div>
						<img class="acd-image-preview" data-role="preview-${side}" alt="${label}" hidden />
						<div class="acd-image-uploading" data-role="uploading-${side}" hidden>
							<i class="fa fa-spinner fa-spin"></i> جاري رفع الصورة...
						</div>
					</div>
					<input
						type="file"
						accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
						data-role="file-input-${side}"
						hidden
					/>
				</div>
			`;
		}

		make_controls($body) {
			const defs = [
				{
					slot: "account_number",
					df: {
						fieldname: "account_number",
						label: "رقم الحساب",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "أدخل رقم الحساب البنكي",
					},
				},
				{
					slot: "base_card_name",
					df: {
						fieldname: "base_card_name",
						label: "اسم البطاقة",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "الاسم الأساسي للبطاقة",
					},
				},
				{
					slot: "card_number",
					df: {
						fieldname: "card_number",
						label: "رقم البطاقة",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "أدخل رقم البطاقة",
					},
				},
				{
					slot: "bank",
					df: {
						fieldname: "bank",
						label: "البنك",
						fieldtype: "Link",
						options: "Archive Bank",
						reqd: 1,
						placeholder: "اختر البنك",
					},
				},
				{
					slot: "card_owner",
					df: {
						fieldname: "card_owner",
						label: "مالك البطاقة",
						fieldtype: "Link",
						options: "Archive Account",
						reqd: 1,
						placeholder: "اختر مالك البطاقة",
					},
				},
				{
					slot: "daily_limit",
					df: {
						fieldname: "daily_limit",
						label: "الحد اليومي",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "0.00",
					},
				},
				{
					slot: "region",
					df: {
						fieldname: "region",
						label: "المنطقة",
						fieldtype: "Link",
						options: "Archive Region",
						reqd: 1,
						placeholder: "اختر المنطقة",
					},
				},
				{
					slot: "representative",
					df: {
						fieldname: "representative",
						label: "المندوب",
						fieldtype: "Link",
						options: "Archive Representative",
						reqd: 1,
						placeholder: "اختر المندوب",
					},
				},
				{
					slot: "received_date",
					df: {
						fieldname: "received_date",
						label: "تاريخ الاستلام",
						fieldtype: "Date",
						reqd: 1,
						default: frappe.datetime.get_today(),
					},
				},
				{
					slot: "status",
					df: {
						fieldname: "status",
						label: "الحالة الابتدائية",
						fieldtype: "Select",
						options: ["نشطة", "موقفة مؤقتاً", "موقفة نهائياً"].join("\n"),
						default: "نشطة",
						reqd: 1,
						onchange: () => {
							const st = this.controls.status?.get_value() || "نشطة";
							const is_perm = st === "موقفة نهائياً";
							$body.find('[data-field-slot="status_reason"]').prop("hidden", !is_perm);
							if (!is_perm && this.controls.status_reason) {
								this.controls.status_reason.set_value("");
							}
						},
					},
				},
				{
					slot: "status_reason",
					df: {
						fieldname: "status_reason",
						label: "سبب الإيقاف النهائي (إلزامي)",
						fieldtype: "Small Text",
						placeholder: "أدخل سبب الإيقاف النهائي للبطاقة...",
					},
				},
			];

			defs.forEach(({ slot, df }) => {
				const $parent = $body.find(`[data-field-slot="${slot}"]`);
				const ctrl = frappe.ui.form.make_control({
					parent: $parent[0],
					df,
					render_input: true,
				});
				ctrl.refresh();
				if (df.default) {
					ctrl.set_value(df.default);
				}
				if (df.fieldname === "status" && ctrl.$input) {
					ctrl.$input
						.find('option[value="موقفة نهائياً"]')
						.text("موقفة نهائياً (متلفة)");
				}
				this.controls[df.fieldname] = ctrl;
			});

			ArchiveCardDailyLimitInput.bind(this.controls.daily_limit);

			this.family_autocomplete?.destroy();
			this.family_autocomplete = new ArchiveCardFamilyAutocomplete({
				dialog: this.dialog,
				controls: {
					base_card_name: this.controls.base_card_name,
					account_number: this.controls.account_number,
					bank: this.controls.bank,
				},
				enabled_provider: () => !this.is_submitting,
				initial_values: {
					base_card_name: "",
					account_number: "",
					bank: "",
				},
				on_account_changed: (acc, meta = {}) => {
					this.schedule_account_family_check(acc, meta);
				},
			});
		}

		bind_events() {
			const $body = $(this.dialog.body);

			// PIN visibility toggle
			$body.on("click", '[data-action="toggle-pin"]', (e) => {
				e.preventDefault();
				this.pin_visible = !this.pin_visible;
				const $pin = $body.find('[data-role="pin-input"]');
				$pin.attr("type", this.pin_visible ? "text" : "password");
				$(e.currentTarget)
					.find("i")
					.attr("class", this.pin_visible ? "fa fa-eye-slash" : "fa fa-eye");
			});

			// Image pickers
			$body.on("click", '[data-action="pick-image"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side");
				$body.find(`[data-role="file-input-${side}"]`).trigger("click");
			});

			$body.on("click", '[data-action="frame-click"]', (e) => {
				const side = $(e.currentTarget).attr("data-side");
				if (this.preview_urls[side]) {
					if (window.ArchiveCardImageViewer) {
						window.ArchiveCardImageViewer.open({
							card_title: side === "front" ? "معاينة الوجه الأمامي" : "معاينة الوجه الخلفي",
							image_url: this.preview_urls[side],
							initial_side: side,
						});
					}
				} else {
					$body.find(`[data-role="file-input-${side}"]`).trigger("click");
				}
			});

			$body.on("click", '[data-action="zoom-staged"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side");
				if (this.preview_urls[side] && window.ArchiveCardImageViewer) {
					window.ArchiveCardImageViewer.open({
						card_title: side === "front" ? "معاينة الوجه الأمامي" : "معاينة الوجه الخلفي",
						image_url: this.preview_urls[side],
						initial_side: side,
					});
				}
			});

			$body.on("click", '[data-action="preview-edit-image"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side") || "front";
				this.open_image_editor(side);
			});

			["front", "back"].forEach((side) => {
				$body.on("change", `[data-role="file-input-${side}"]`, async (e) => {
					const file = e.target.files && e.target.files[0];
					if (!file) return;
					await this.handle_file_selected(side, file);
					e.target.value = "";
				});
			});
		}

		open_image_editor(side) {
			if (!this.can_preview_images() || !window.ArchiveCardImageEditor) return;
			const orig_url = this.original_preview_urls[side] || this.preview_urls[side];
			if (!orig_url) return;
			const $body = $(this.dialog.body);
			window.ArchiveCardImageEditor.open({
				can_preview: true,
				side,
				side_label: side === "back" ? "الوجه الخلفي" : "الوجه الأمامي",
				original_url: orig_url,
				initial_meta: this.edit_metas[side] || null,
				saved_meta: this.edit_metas[side] || null,
				on_apply: ({ staged, blob_url, edit_meta }) => {
					this.staged_files[side] = staged;
					if (staged?.file_id) {
						this.all_staged_file_ids.add(staged.file_id);
					}
					if (
						this.preview_urls[side] &&
						this.preview_urls[side] !== this.original_preview_urls[side]
					) {
						URL.revokeObjectURL(this.preview_urls[side]);
					}
					this.preview_urls[side] = blob_url;
					this.edit_metas[side] = edit_meta || null;
					$body
						.find(`[data-role="preview-${side}"]`)
						.attr("src", blob_url)
						.addClass("is-processed")
						.prop("hidden", false);
				},
			});
		}

		async handle_file_selected(side, file) {
			const $body = $(this.dialog.body);
			const $uploading = $body.find(`[data-role="uploading-${side}"]`);
			const $empty = $body.find(`[data-role="empty-${side}"]`);
			const $preview = $body.find(`[data-role="preview-${side}"]`);
			const $zoomBtn = $body.find(`[data-action="zoom-staged"][data-side="${side}"]`);
			const $editBtn = $body.find(`[data-action="preview-edit-image"][data-side="${side}"]`);

			$uploading.prop("hidden", false);
			try {
				const staged = await upload_staged_card_image(file, side);
				this.staged_files[side] = staged;
				this.original_staged_files[side] = staged;
				this.edit_metas[side] = null;
				if (staged.file_id) {
					this.all_staged_file_ids.add(staged.file_id);
				}

				if (
					this.preview_urls[side] &&
					this.preview_urls[side] !== this.original_preview_urls[side]
				) {
					URL.revokeObjectURL(this.preview_urls[side]);
				}
				if (this.original_preview_urls[side]) {
					URL.revokeObjectURL(this.original_preview_urls[side]);
				}
				const blob_url = URL.createObjectURL(file);
				this.original_preview_urls[side] = blob_url;
				this.preview_urls[side] = blob_url;

				$empty.prop("hidden", true);
				$preview.attr("src", blob_url).removeClass("is-processed").prop("hidden", false);
				$zoomBtn.prop("hidden", false);
				if (this.can_preview_images()) {
					$editBtn.prop("hidden", false);
					this.open_image_editor(side);
				}
			} catch (err) {
				frappe.msgprint({
					title: "خطأ في رفع الصورة",
					message: err.message || "تعذر رفع الصورة.",
					indicator: "red",
				});
			} finally {
				$uploading.prop("hidden", true);
			}
		}

		reset_duplicate_ui() {
			this.duplicate_family_info = null;
			if (!this.dialog) return;
			const $body = $(this.dialog.body);
			$body.find('[data-role="duplicate-banner"]').prop("hidden", true).empty();
			$body.find('[data-role="copy-badge"]').text("نسخة 1").removeClass("is-duplicate");
			$body.find('[data-role="derived-name-hint"]').prop("hidden", true).empty();
		}

		apply_duplicate_ui(info) {
			this.duplicate_family_info = info;
			if (!this.dialog) return;
			const $body = $(this.dialog.body);
			const $banner = $body.find('[data-role="duplicate-banner"]');
			const $badge = $body.find('[data-role="copy-badge"]');
			const $hint = $body.find('[data-role="derived-name-hint"]');

			if (info && info.family_exists) {
				$badge
					.text(`نسخة ${info.expected_copy_no}`)
					.addClass("is-duplicate");

				if (info.base_card_name) {
					this.family_autocomplete?.sync_from_account_lookup(info.base_card_name);
				}

				$hint
					.prop("hidden", false)
					.html(
						`اسم البطاقة يتبع الاسم الأساسي لعائلة الحساب: <strong>${frappe.utils.escape_html(
							info.base_card_name
						)}</strong> <span class="ac-copy-badge">نسخة ${info.expected_copy_no}</span>`
					);

				$banner.prop("hidden", false).html(`
					<div class="acd-dup-banner-inner">
						<i class="fa fa-exclamation-triangle"></i>
						<div>
							<strong>تنبيه تكرار رقم الحساب:</strong>
							رقم الحساب <code>${frappe.utils.escape_html(info.account_number)}</code> مسجل مسبقاً لعائلة
							<strong>${frappe.utils.escape_html(info.base_card_name)}</strong>
							(${info.active_count} بطاقة نشطة).
							سيتم إصدار هذه البطاقة باسم
							<strong>${frappe.utils.escape_html(info.base_card_name)}</strong>
							<span class="ac-copy-badge">نسخة ${info.expected_copy_no}</span> بعد التأكيد.
						</div>
					</div>
				`);
			} else {
				this.reset_duplicate_ui();
			}
		}

		schedule_account_family_check(_acc, meta = {}) {
			clearTimeout(this._dup_check_timer);
			const clean_acc = String(this.controls.account_number?.get_value() || "").trim();
			const clean_base = String(this.controls.base_card_name?.get_value() || "").trim();
			const clean_bank = String(this.controls.bank?.get_value() || "").trim();
			if (!clean_acc || !clean_base || !clean_bank) {
				this._dup_check_seq += 1;
				this.reset_duplicate_ui();
				return;
			}

			const local_match = this.family_autocomplete?.find_by_triplet(
				clean_base,
				clean_acc,
				clean_bank
			);
			if (this.family_autocomplete?.loaded && !local_match) {
				this._dup_check_seq += 1;
				this.reset_duplicate_ui();
				return;
			}

			if (meta.immediate) {
				this.check_account_family();
				return;
			}

			this._dup_check_timer = setTimeout(() => {
				this.check_account_family();
			}, 250);
		}

		async check_account_family(opts = {}) {
			const acc = String(this.controls.account_number?.get_value() || "").trim();
			const base_name = String(this.controls.base_card_name?.get_value() || "").trim();
			const bank = String(this.controls.bank?.get_value() || "").trim();
			if (!acc || !base_name || !bank) {
				this.reset_duplicate_ui();
				return null;
			}

			const triplet_key = ArchiveCardFamilyAutocomplete.make_triplet_key(
				base_name,
				acc,
				bank
			);
			if (!opts.force_remote && triplet_key && this._dup_info_cache.has(triplet_key)) {
				const cached = this._dup_info_cache.get(triplet_key);
				this.apply_duplicate_ui(cached);
				return cached;
			}

			const seq = ++this._dup_check_seq;
			try {
				const res = await frappe.call({
					method: "archive.api.cards.check_duplicate_account",
					args: {
						account_number: acc,
						base_card_name: base_name,
						bank: bank,
					},
				});
				const info = res?.message || null;
				if (triplet_key && info) {
					this._dup_info_cache.set(triplet_key, info);
				}
				const latest_key = ArchiveCardFamilyAutocomplete.make_triplet_key(
					this.controls.base_card_name?.get_value() || "",
					this.controls.account_number?.get_value() || "",
					this.controls.bank?.get_value() || ""
				);
				if (seq === this._dup_check_seq && latest_key === triplet_key) {
					this.apply_duplicate_ui(info);
				}
				return info;
			} catch (_) {
				return null;
			}
		}

		collect_payload() {
			const $body = $(this.dialog.body);
			const pin = String($body.find('[data-role="pin-input"]').val() ?? "");

			const payload = {
				account_number: String(this.controls.account_number?.get_value() || "").trim(),
				base_card_name: String(this.controls.base_card_name?.get_value() || "").trim(),
				card_number: String(this.controls.card_number?.get_value() || "").trim(),
				bank: String(this.controls.bank?.get_value() || "").trim(),
				card_owner: String(this.controls.card_owner?.get_value() || "").trim(),
				daily_limit: ArchiveCardDailyLimitInput.extract_api_value(this.controls.daily_limit),
				region: String(this.controls.region?.get_value() || "").trim(),
				representative: String(this.controls.representative?.get_value() || "").trim(),
				received_date: String(this.controls.received_date?.get_value() || "").trim(),
				status: String(this.controls.status?.get_value() || "نشطة").trim(),
				status_reason: String(this.controls.status_reason?.get_value() || "").trim(),
				pin,
				front_image: this.staged_files.front?.file_id || this.staged_files.front?.file_url || "",
				back_image: this.staged_files.back?.file_id || this.staged_files.back?.file_url || "",
			};
			if (this.edit_metas.front) {
				payload.front_original_image =
					this.original_staged_files.front?.file_id ||
					this.original_staged_files.front?.file_url ||
					"";
				payload.front_edit_meta = this.edit_metas.front;
			}
			if (this.edit_metas.back) {
				payload.back_original_image =
					this.original_staged_files.back?.file_id ||
					this.original_staged_files.back?.file_url ||
					"";
				payload.back_edit_meta = this.edit_metas.back;
			}
			return payload;
		}

		validate_client_payload(payload) {
			const required_checks = [
				[payload.account_number, "رقم الحساب"],
				[payload.base_card_name, "اسم البطاقة"],
				[payload.card_number, "رقم البطاقة"],
				[payload.bank, "البنك"],
				[payload.card_owner, "مالك البطاقة"],
				[payload.daily_limit, "الحد اليومي"],
				[payload.region, "المنطقة"],
				[payload.representative, "المندوب"],
				[payload.received_date, "تاريخ الاستلام"],
				[payload.pin.trim(), "الرقم السري (PIN)"],
				[payload.front_image, "صورة الوجه الأمامي"],
			];

			for (const [val, label] of required_checks) {
				if (!val) {
					frappe.msgprint({
						title: "حقول مطلوبة",
						message: `يرجى استكمال حقل: <strong>${label}</strong>`,
						indicator: "orange",
					});
					return false;
				}
			}

			if (payload.status === "موقفة نهائياً" && !payload.status_reason) {
				frappe.msgprint({
					title: "سبب الإيقاف النهائي مطلوب",
					message: "يرجى إدخال سبب الإيقاف النهائي عند اختيار حالة (موقفة نهائياً (متلفة)).",
					indicator: "red",
				});
				return false;
			}

			if (!/^[0-9٠-٩۰-۹]{4}$/.test(payload.pin)) {
				frappe.msgprint({
					title: "الرقم السري غير صالح",
					message: "الرقم السري يجب أن يتكون من 4 أرقام بالضبط.",
					indicator: "red",
				});
				return false;
			}

			const clean_num = Number(String(payload.daily_limit || "").replace(/,/g, ""));
			if (!Number.isFinite(clean_num) || clean_num <= 0) {
				frappe.msgprint({
					title: "الحد اليومي غير صالح",
					message: "الحد اليومي مطلوب ويجب أن يكون رقماً أكبر من صفر.",
					indicator: "red",
				});
				return false;
			}

			return true;
		}

		async handle_submit() {
			if (this.is_submitting) return;
			this.family_autocomplete?.hide_all();
			const payload = this.collect_payload();
			if (!this.validate_client_payload(payload)) return;

			this.is_submitting = true;
			this.dialog.get_primary_btn().prop("disabled", true);

			try {
				const dup_info = await this.check_account_family({ force_remote: true });
				if (dup_info && dup_info.family_exists) {
					const norm_cnum = ArchiveCardFamilyAutocomplete.normalize_account(
						payload.card_number
					);
					const sibling_dup = (dup_info.existing_cards || []).some(
						(c) =>
							norm_cnum &&
							ArchiveCardFamilyAutocomplete.normalize_account(c.card_number) ===
								norm_cnum
					);
					if (sibling_dup) {
						this.is_submitting = false;
						this.dialog.get_primary_btn().prop("disabled", false);
						frappe.msgprint({
							title: "رقم البطاقة مكرر",
							message: `رقم البطاقة (<strong>${frappe.utils.escape_html(
								payload.card_number
							)}</strong>) مستخدم مسبقاً في بطاقة أخرى ولا يمكن تكراره.`,
							indicator: "red",
						});
						return;
					}
					if (dup_info.base_card_name) {
						payload.base_card_name = dup_info.base_card_name;
					}
					this.is_submitting = false;
					this.dialog.get_primary_btn().prop("disabled", false);
					this.show_duplicate_confirmation_modal(dup_info, payload);
					return;
				}

				await this.execute_create(payload, false);
			} catch (err) {
				this.is_submitting = false;
				this.dialog.get_primary_btn().prop("disabled", false);
			}
		}

		show_duplicate_confirmation_modal(dup_info, payload) {
			const cards = Array.isArray(dup_info.existing_cards) ? dup_info.existing_cards : [];
			const rows_html = cards.length
				? cards
						.map(
							(c) => `
						<tr>
							<td>
								<strong>${frappe.utils.escape_html(c.base_card_name || dup_info.base_card_name || "")}</strong>
								<span class="ac-copy-badge ac-row-copy-badge">نسخة ${c.copy_no || 1}</span>
							</td>
							<td dir="ltr">${frappe.utils.escape_html(c.card_number)}</td>
							<td>${frappe.utils.escape_html(c.bank_name || c.bank)}</td>
							<td>${frappe.utils.escape_html(c.representative_name || c.representative)}</td>
							<td>${frappe.utils.escape_html(c.region_name || c.region)}</td>
							<td>${frappe.utils.escape_html(c.status)}</td>
						</tr>
					`
						)
						.join("")
				: `<tr><td colspan="6" class="text-center text-muted">توجد نسخ تاريخية سابقة على هذه العائلة.</td></tr>`;

			const confirm_dialog = new frappe.ui.Dialog({
				title: "تأكيد إنشاء نسخة جديدة على رقم حساب مكرر",
				size: "large",
				primary_action_label: "المتابعة وإنشاء نسخة جديدة",
				primary_action: async () => {
					confirm_dialog.hide();
					await this.execute_create(payload, true);
				},
				secondary_action_label: "إلغاء والعودة للتعديل",
				secondary_action: () => {
					confirm_dialog.hide();
				},
			});

			$(confirm_dialog.body).attr("dir", "rtl").html(`
				<div class="acd-dup-confirm-body" dir="rtl">
					<div class="acd-dup-summary-box">
						<div>رقم الحساب: <strong dir="ltr">${frappe.utils.escape_html(dup_info.account_number)}</strong></div>
						<div>اسم البطاقة: <strong>${frappe.utils.escape_html(dup_info.base_card_name)}</strong></div>
						<div>رقم النسخة الجديدة المتوقع: <span class="ac-copy-badge">نسخة ${dup_info.expected_copy_no}</span></div>
					</div>
					<div class="acd-dup-table-title">البطاقات الحالية المرتبطة بهذا الحساب (${cards.length}):</div>
					<div class="table-responsive">
						<table class="table table-bordered acd-dup-table">
							<thead>
								<tr>
									<th>اسم البطاقة</th>
									<th>رقم البطاقة</th>
									<th>البنك</th>
									<th>المندوب</th>
									<th>المنطقة</th>
									<th>الحالة</th>
								</tr>
							</thead>
							<tbody>${rows_html}</tbody>
						</table>
					</div>
				</div>
			`);

			confirm_dialog.show();
		}

		async execute_create(payload, allow_duplicate) {
			this.is_submitting = true;
			this.dialog.get_primary_btn().prop("disabled", true);

			try {
				const final_payload = {
					...payload,
					allow_duplicate_account: allow_duplicate ? 1 : 0,
				};

				const res = await frappe.call({
					method: "archive.api.cards.create_card",
					args: { payload: final_payload },
				});

				this.saved_successfully = true;
				const used_ids = new Set([
					this.staged_files.front?.file_id,
					this.staged_files.back?.file_id,
					this.original_staged_files.front?.file_id,
					this.original_staged_files.back?.file_id,
				]);
				const unused_ids = [...this.all_staged_file_ids].filter((id) => id && !used_ids.has(id));
				if (unused_ids.length) {
					frappe.call({
						method: "archive.api.cards.cleanup_staged_card_images",
						args: { file_ids: unused_ids },
					});
				}

				frappe.show_alert({
					message: "تم إنشاء البطاقة بنجاح.",
					indicator: "green",
				});

				this.dialog.hide();
				if (typeof this.on_created === "function") {
					await this.on_created(res?.message?.card);
				}
			} finally {
				this.is_submitting = false;
				if (this.dialog) {
					this.dialog.get_primary_btn().prop("disabled", false);
				}
			}
		}

		cleanup_unused_staged_files() {
			const urls = new Set([
				...Object.values(this.preview_urls),
				...Object.values(this.original_preview_urls),
			]);
			urls.forEach((u) => {
				if (u) URL.revokeObjectURL(u);
			});
			this.preview_urls = { front: null, back: null };
			this.original_preview_urls = { front: null, back: null };

			if (this.saved_successfully) return;
			const ids = [...this.all_staged_file_ids].filter(Boolean);
			if (ids.length) {
				frappe.call({
					method: "archive.api.cards.cleanup_staged_card_images",
					args: { file_ids: ids },
				});
			}
		}
	}

	const DIGIT_TRANSLATION_MAP = {
		"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
		"٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
		"۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
		"۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
	};

	const ArchiveCardDailyLimitInput = {
		PLACEHOLDER: "0.00",

		normalize_digits(raw) {
			return String(raw ?? "").replace(/[٠-٩۰-۹]/g, (c) => DIGIT_TRANSLATION_MAP[c] || c);
		},

		format_with_caret(raw_val, raw_caret) {
			const norm = this.normalize_digits(raw_val);
			const caret = Math.max(
				0,
				Math.min(norm.length, Number.isFinite(raw_caret) ? raw_caret : norm.length)
			);

			if (norm.replace(/[^0-9]/g, "") === "") {
				return { text: "", caret: 0 };
			}

			const first_dot = norm.indexOf(".");
			const second_dot = first_dot !== -1 ? norm.indexOf(".", first_dot + 1) : -1;

			let int_raw = "";
			let dec_raw = "";
			let in_decimal = false;
			let int_digits_before_caret = 0;
			let dec_digits_before_caret = 0;

			if (second_dot !== -1) {
				int_raw = norm.slice(0, first_dot).replace(/[^0-9]/g, "");
				dec_raw = norm.slice(second_dot + 1).replace(/[^0-9]/g, "");
				in_decimal = true;
				dec_digits_before_caret = 0;
			} else if (first_dot !== -1) {
				int_raw = norm.slice(0, first_dot).replace(/[^0-9]/g, "");
				dec_raw = norm.slice(first_dot + 1).replace(/[^0-9]/g, "");
				if (caret <= first_dot) {
					in_decimal = false;
					int_digits_before_caret = norm.slice(0, caret).replace(/[^0-9]/g, "").length;
				} else {
					in_decimal = true;
					dec_digits_before_caret = Math.min(
						2,
						norm.slice(first_dot + 1, caret).replace(/[^0-9]/g, "").length
					);
				}
			} else {
				int_raw = norm.replace(/[^0-9]/g, "");
				dec_raw = "00";
				in_decimal = false;
				int_digits_before_caret = norm.slice(0, caret).replace(/[^0-9]/g, "").length;
			}

			const dec_padded = dec_raw.slice(0, 2).padEnd(2, "0");

			if (!int_raw && dec_padded === "00" && !in_decimal) {
				return { text: "", caret: 0 };
			}

			const stripped_zeros = int_raw.length - int_raw.replace(/^0+(?=\d)/, "").length;
			const int_clean = int_raw ? int_raw.replace(/^0+(?=\d)/, "") : "0";
			const int_formatted = int_clean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			const text = `${int_formatted}.${dec_padded}`;

			let next_caret = int_formatted.length;
			if (in_decimal) {
				next_caret = int_formatted.length + 1 + dec_digits_before_caret;
			} else {
				const target_int_digits = Math.max(
					0,
					Math.min(int_clean.length, int_digits_before_caret - stripped_zeros)
				);
				if (target_int_digits === 0) {
					next_caret = int_raw ? 0 : 1;
				} else {
					let seen = 0;
					for (let i = 0; i < int_formatted.length; i += 1) {
						if (/[0-9]/.test(int_formatted[i])) {
							seen += 1;
							if (seen === target_int_digits) {
								next_caret = i + 1;
								break;
							}
						}
					}
				}
			}

			return { text, caret: next_caret };
		},

		extract_api_value(ctrl) {
			const raw = this.normalize_digits(
				ctrl?.$input ? ctrl.$input.val() : ctrl?.get_value?.() || ""
			)
				.replace(/,/g, "")
				.trim();
			if (!raw) return "";
			const num = Number(raw);
			if (!Number.isFinite(num)) return raw;
			return num.toFixed(2);
		},

		bind(ctrl) {
			const $inp = ctrl?.$input;
			if (!$inp || !$inp.length) return;
			const el = $inp[0];

			ctrl.parse = (val) => (val ? this.format_with_caret(val, 0).text : "");
			ctrl.format_for_input = (val) => (val ? this.format_with_caret(val, 0).text : "");

			$inp
				.attr("dir", "ltr")
				.attr("inputmode", "decimal")
				.attr("placeholder", this.PLACEHOLDER)
				.addClass("acd-money-center-input");

			const sync_value = (val, caret) => {
				ctrl.value = val;
				if (el.value !== val) {
					el.value = val;
				}
				if (typeof caret === "number" && document.activeElement === el) {
					try {
						el.setSelectionRange(caret, caret);
					} catch (_) {
						// ignore
					}
				}
			};

			if (el.value && String(el.value).trim() !== "") {
				const init = this.format_with_caret(el.value, 0);
				sync_value(init.text, null);
			}

			$inp.off(".acdDailyLimit");

			$inp.on("keydown.acdDailyLimit", (e) => {
				if (el.readOnly || el.disabled) return;
				const val = el.value || "";
				const start = el.selectionStart ?? 0;
				const end = el.selectionEnd ?? 0;
				if (start !== end) return;

				const dot_idx = val.indexOf(".");

				if ((e.key === "." || e.key === "Decimal") && dot_idx !== -1) {
					e.preventDefault();
					const pos = dot_idx + 1;
					el.setSelectionRange(pos, pos);
					return;
				}

				if (e.key === "Backspace" && val) {
					if (dot_idx !== -1 && start > dot_idx) {
						const d1 = val[dot_idx + 1] || "0";
						const d2 = val[dot_idx + 2] || "0";
						if (d1 === "0" && d2 === "0") {
							el.setSelectionRange(dot_idx, dot_idx);
						} else if (start === dot_idx + 3 && d2 === "0") {
							el.setSelectionRange(dot_idx + 2, dot_idx + 2);
						} else if (start === dot_idx + 1) {
							el.setSelectionRange(dot_idx, dot_idx);
						}
					} else if (start > 0 && val[start - 1] === ",") {
						el.setSelectionRange(start - 1, start - 1);
					}
				} else if (e.key === "Delete" && val) {
					if (val[start] === ",") {
						el.setSelectionRange(start + 1, start + 1);
					}
				}
			});

			$inp.on("input.acdDailyLimit", () => {
				if (el.readOnly || el.disabled) return;
				const res = this.format_with_caret(el.value, el.selectionStart);
				sync_value(res.text, res.caret);
			});

			$inp.on("blur.acdDailyLimit", () => {
				if (!el.value || !el.value.replace(/[^0-9]/g, "")) {
					sync_value("", null);
					return;
				}
				const res = this.format_with_caret(el.value, 0);
				sync_value(res.text, null);
			});
		},
	};

	class ArchiveCardFamilyAutocomplete {
		static instance_counter = 0;

		static normalize_digits(raw) {
			return String(raw ?? "").replace(/[٠-٩۰-۹]/g, (c) => DIGIT_TRANSLATION_MAP[c] || c);
		}

		static normalize_account(raw) {
			const clean = this.normalize_digits(raw).trim();
			if (!clean) return "";
			return clean.replace(/[\s\-_\u200b-\u200f\u202a-\u202e]+/g, "").toUpperCase();
		}

		static normalize_exact_name(raw) {
			return String(raw ?? "")
				.normalize("NFKC")
				.trim()
				.replace(/\s+/g, " ")
				.toLocaleLowerCase();
		}

		static normalize_search_text(raw) {
			return this.normalize_digits(String(raw ?? "").normalize("NFKC"))
				.toLocaleLowerCase()
				.replace(/[\u064b-\u065f\u0670\u0640]/g, "")
				.replace(/[أإآٱ]/g, "ا")
				.replace(/ة/g, "ه")
				.replace(/ى/g, "ي")
				.replace(/ؤ/g, "و")
				.replace(/ئ/g, "ي")
				.replace(/\s+/g, " ")
				.trim();
		}

		static make_triplet_key(base_name, acc, bank) {
			const n_base = this.normalize_exact_name(base_name);
			const n_acc = this.normalize_account(acc);
			const n_bank = this.normalize_exact_name(bank);
			if (!n_base || !n_acc || !n_bank) return "";
			return `${n_base}||${n_acc}||${n_bank}`;
		}

		constructor(options = {}) {
			this.dialog = options.dialog || null;
			this.controls = options.controls || {};
			this.enabled_provider =
				typeof options.enabled_provider === "function" ? options.enabled_provider : () => true;
			this.on_account_changed =
				typeof options.on_account_changed === "function" ? options.on_account_changed : null;
			this.limit = Number(options.limit || 12);

			const init_base = String(options.initial_values?.base_card_name || "").trim();
			const init_acc = String(options.initial_values?.account_number || "").trim();
			const init_bank = String(options.initial_values?.bank || "").trim();
			this.initial_values = {
				base_card_name: init_base,
				account_number: init_acc,
				bank: init_bank,
			};
			this.fallback_base_card_name = init_base;
			this.fallback_account_number = init_acc;
			this.fallback_bank = init_bank;
			this.last_account_raw = init_acc;
			this.last_bank_raw = init_bank;
			this.is_base_autofilled = false;
			this.is_acc_autofilled = false;
			this.is_bank_autofilled = false;
			this.selected_family = null;
			this.is_applying = false;
			this.is_destroyed = false;

			this.loaded = false;
			this._load_promise = null;
			this.families = [];
			this.by_triplet = new Map();
			this.by_norm_account = new Map();
			this.by_norm_account_list = new Map();
			this.unique_name_items = [];
			this.unique_account_items = [];

			this.instance_id = ++ArchiveCardFamilyAutocomplete.instance_counter;
			this.ns = `.acd_fam_ac_${this.instance_id}`;
			this.states = new Map();
			this._focus_ready = false;

			this.attach_fields();
			this.bind_global_events();

			if (this.is_enabled()) {
				this.ensure_loaded();
			}

			this._focus_ready_timer = setTimeout(() => {
				if (!this.is_destroyed) {
					this._focus_ready = true;
				}
			}, 260);
		}

		is_enabled() {
			return !this.is_destroyed && Boolean(this.enabled_provider());
		}

		ensure_loaded() {
			if (this.loaded) return Promise.resolve(this.families);
			if (this._load_promise) return this._load_promise;

			this._load_promise = frappe
				.call({
					method: "archive.api.cards.get_card_family_lookups",
					type: "GET",
				})
				.then((res) => {
					const list = Array.isArray(res?.message?.families) ? res.message.families : [];
					this.build_indexes(list);
					this.loaded = true;
					return this.families;
				})
				.catch(() => {
					this._load_promise = null;
					return [];
				});

			return this._load_promise;
		}

		build_indexes(list) {
			this.families = list;
			this.by_triplet.clear();
			this.by_norm_account.clear();
			this.by_norm_account_list.clear();
			this.unique_name_items = [];
			this.unique_account_items = [];

			const seen_triplets = new Set();

			for (const fam of list) {
				const base_name = String(fam.base_card_name || "").trim();
				const acc_num = String(fam.account_number || "").trim();
				const norm_acc =
					String(fam.account_number_normalized || "").trim() ||
					ArchiveCardFamilyAutocomplete.normalize_account(acc_num);
				const bank = String(fam.bank || "").trim();
				const bank_label = String(fam.bank_name || bank).trim();
				if (!base_name || !acc_num || !norm_acc || !bank) continue;

				const t_key = ArchiveCardFamilyAutocomplete.make_triplet_key(
					base_name,
					norm_acc,
					bank
				);
				if (!t_key || seen_triplets.has(t_key)) continue;
				seen_triplets.add(t_key);
				this.by_triplet.set(t_key, fam);

				if (!this.by_norm_account_list.has(norm_acc)) {
					this.by_norm_account_list.set(norm_acc, []);
				}
				this.by_norm_account_list.get(norm_acc).push(fam);

				if (!this.by_norm_account.has(norm_acc)) {
					this.by_norm_account.set(norm_acc, fam);
				}

				const exact_name_key = ArchiveCardFamilyAutocomplete.normalize_exact_name(base_name);
				this.unique_name_items.push({
					value: base_name,
					secondary_text: bank_label,
					exact_key: exact_name_key,
					search_key: ArchiveCardFamilyAutocomplete.normalize_search_text(base_name),
					bank_search_key: ArchiveCardFamilyAutocomplete.normalize_search_text(bank_label),
					triplet_key: t_key,
					family: fam,
				});

				this.unique_account_items.push({
					value: acc_num,
					secondary_text: bank_label ? `${base_name} — ${bank_label}` : base_name,
					norm_acc,
					raw_lower: acc_num.toLocaleLowerCase(),
					triplet_key: t_key,
					family: fam,
				});
			}
		}

		find_by_triplet(base_name, raw_acc, bank) {
			const key = ArchiveCardFamilyAutocomplete.make_triplet_key(base_name, raw_acc, bank);
			if (!key) return null;
			return this.by_triplet.get(key) || null;
		}

		find_unique_by_account(raw_acc) {
			const norm = ArchiveCardFamilyAutocomplete.normalize_account(raw_acc);
			if (!norm) return null;
			const list = this.by_norm_account_list.get(norm) || [];
			return list.length === 1 ? list[0] : null;
		}

		find_by_account(raw_acc) {
			return this.find_unique_by_account(raw_acc);
		}

		notify_triplet_changed(meta = {}) {
			if (!this.on_account_changed) return;
			const cur_acc = String(this.controls.account_number?.get_value() || "").trim();
			const cur_base = String(this.controls.base_card_name?.get_value() || "").trim();
			const cur_bank = String(this.controls.bank?.get_value() || "").trim();
			const matched =
				meta.matched_family !== undefined
					? meta.matched_family
					: this.find_by_triplet(cur_base, cur_acc, cur_bank);
			this.on_account_changed(cur_acc, {
				immediate: Boolean(meta.immediate),
				matched_family: matched,
			});
		}

		attach_fields() {
			for (const fieldname of ["base_card_name", "account_number"]) {
				const ctrl = this.controls[fieldname];
				const $input = ctrl?.$input;
				if (!$input || !$input.length) continue;

				$input.attr("autocomplete", "off");

				const $menu = $(
					`<div class="acd-autocomplete-menu" role="listbox" style="display:none;"></div>`
				);
				$("body").append($menu);

				const state = {
					fieldname,
					ctrl,
					$input,
					$menu,
					items: [],
					active_index: -1,
					edited_since_focus: false,
				};
				this.states.set(fieldname, state);

				$input
					.off(this.ns)
					.on(`focus${this.ns}`, () => {
						state.edited_since_focus = false;
						if (this._focus_ready) {
							this.open_suggestions(state, { show_all_if_exact: true });
						}
					})
					.on(`click${this.ns}`, () => {
						this._focus_ready = true;
						if (!state.$menu.is(":visible")) {
							this.open_suggestions(state, {
								show_all_if_exact: !state.edited_since_focus,
							});
						}
					})
					.on(`input${this.ns}`, () => {
						if (this.is_applying || !this.is_enabled()) return;
						this._focus_ready = true;
						state.edited_since_focus = true;
						if (fieldname === "base_card_name") {
							this.handle_base_name_typed(state);
						} else {
							this.handle_account_typed(state, { open_menu: true });
						}
					})
					.on(`change${this.ns}`, () => {
						if (this.is_applying || !this.is_enabled()) return;
						if (fieldname === "account_number") {
							this.handle_account_typed(state, { open_menu: false });
						}
					})
					.on(`keydown${this.ns}`, (e) => {
						this.handle_keydown(state, e);
					})
					.on(`blur${this.ns}`, () => {
						setTimeout(() => {
							if (!this.is_destroyed) {
								this.hide_menu(state);
							}
						}, 130);
					});

				$menu
					.on(`mousedown${this.ns}`, ".acd-autocomplete-item", (e) => {
						e.preventDefault();
					})
					.on(`click${this.ns}`, ".acd-autocomplete-item", (e) => {
						const idx = Number($(e.currentTarget).attr("data-index"));
						this.select_item(state, idx);
					});
			}

			const $bank_input = this.controls.bank?.$input;
			if ($bank_input && $bank_input.length) {
				$bank_input
					.off(this.ns)
					.on(
						`input${this.ns} change${this.ns} blur${this.ns} awesomplete-selectcomplete${this.ns}`,
						() => {
							if (this.is_applying || !this.is_enabled()) return;
							this.handle_bank_changed();
						}
					);
			}
		}

		bind_global_events() {
			$(document).on(`mousedown${this.ns}`, (e) => {
				for (const state of this.states.values()) {
					if (
						!state.$input.is(e.target) &&
						!state.$menu.is(e.target) &&
						state.$menu.has(e.target).length === 0
					) {
						this.hide_menu(state);
					}
				}
			});

			$(window).on(`resize${this.ns}`, () => {
				for (const state of this.states.values()) {
					if (state.$menu.is(":visible")) {
						this.position_menu(state);
					}
				}
			});

			this.dialog?.$wrapper?.find(".modal-body").on(`scroll${this.ns}`, () => {
				for (const state of this.states.values()) {
					if (state.$menu.is(":visible")) {
						this.position_menu(state);
					}
				}
			});
		}

		async set_control_value(ctrl, val) {
			if (!ctrl) return;
			const str_val = String(val ?? "");
			let res;
			this.is_applying = true;
			try {
				ctrl.value = str_val;
				if (ctrl.$input && ctrl.$input.length && ctrl.$input.val() !== str_val) {
					ctrl.$input.val(str_val);
				}
				res = ctrl.set_value(str_val, true);
			} finally {
				this.is_applying = false;
			}
			await Promise.resolve(res);
		}

		sync_from_account_lookup(base_card_name) {
			const clean_name = String(base_card_name || "").trim();
			if (!clean_name || this.is_destroyed) return;
			const cur = String(this.controls.base_card_name?.get_value() || "").trim();
			if (cur === clean_name) {
				this.is_base_autofilled = true;
				return;
			}
			this.is_base_autofilled = true;
			this.set_control_value(this.controls.base_card_name, clean_name);
		}

		handle_bank_changed() {
			const cur_bank = String(this.controls.bank?.get_value() || "").trim();
			if (cur_bank === this.last_bank_raw) return;
			this.last_bank_raw = cur_bank;
			this.is_bank_autofilled = false;
			this.fallback_bank = cur_bank;
			this.notify_triplet_changed({ immediate: false });
		}

		async handle_base_name_typed(state) {
			const cur_base = String(this.controls.base_card_name?.get_value() || "").trim();
			this.is_base_autofilled = false;
			this.fallback_base_card_name = cur_base;

			if (this.is_acc_autofilled || this.is_bank_autofilled) {
				const still_same =
					this.selected_family &&
					ArchiveCardFamilyAutocomplete.normalize_exact_name(
						this.selected_family.base_card_name
					) === ArchiveCardFamilyAutocomplete.normalize_exact_name(cur_base);

				if (!still_same) {
					this.selected_family = null;
					if (this.is_acc_autofilled) {
						const restore_acc = this.fallback_account_number;
						this.is_acc_autofilled = false;
						this.last_account_raw = restore_acc;
						await this.set_control_value(this.controls.account_number, restore_acc);
					}
					if (this.is_bank_autofilled && this.controls.bank) {
						const restore_bank = this.fallback_bank;
						this.is_bank_autofilled = false;
						this.last_bank_raw = restore_bank;
						await this.set_control_value(this.controls.bank, restore_bank);
					}
				}
			}

			this.notify_triplet_changed({ immediate: false });
			this.open_suggestions(state, { show_all_if_exact: false });
		}

		async handle_account_typed(state, opts = {}) {
			const raw_acc = String(this.controls.account_number?.get_value() || "").trim();
			if (opts.open_menu !== false) {
				this.open_suggestions(state, { show_all_if_exact: false });
			}

			if (raw_acc === this.last_account_raw) return;
			this.last_account_raw = raw_acc;
			this.is_acc_autofilled = false;
			this.fallback_account_number = raw_acc;

			if (!this.loaded) {
				await this.ensure_loaded();
				if (this.is_destroyed) return;
				const latest_acc = String(this.controls.account_number?.get_value() || "").trim();
				if (latest_acc !== raw_acc) return;
			}

			const matched = this.find_unique_by_account(raw_acc);
			if (matched) {
				this.selected_family = matched;
				const is_same_initial_norm =
					Boolean(this.initial_values.account_number) &&
					ArchiveCardFamilyAutocomplete.normalize_account(raw_acc) ===
						ArchiveCardFamilyAutocomplete.normalize_account(
							this.initial_values.account_number
						);
				const user_renamed_own_family =
					is_same_initial_norm &&
					!this.is_base_autofilled &&
					this.fallback_base_card_name !== this.initial_values.base_card_name;

				if (!user_renamed_own_family) {
					this.is_base_autofilled = true;
					await this.set_control_value(
						this.controls.base_card_name,
						matched.base_card_name
					);
				}

				if (matched.bank && this.controls.bank) {
					this.is_bank_autofilled = true;
					this.last_bank_raw = matched.bank;
					await this.set_control_value(this.controls.bank, matched.bank);
				}
			} else {
				this.selected_family = null;
				if (this.is_base_autofilled) {
					this.is_base_autofilled = false;
					await this.set_control_value(
						this.controls.base_card_name,
						this.fallback_base_card_name
					);
				}
				if (this.is_bank_autofilled && this.controls.bank) {
					const restore_bank = this.fallback_bank;
					this.is_bank_autofilled = false;
					this.last_bank_raw = restore_bank;
					await this.set_control_value(this.controls.bank, restore_bank);
				}
			}

			this.notify_triplet_changed({ immediate: false });
		}

		filter_items(fieldname, raw_query, show_all_if_exact = false) {
			if (fieldname === "base_card_name") {
				const q_search = ArchiveCardFamilyAutocomplete.normalize_search_text(raw_query);
				const q_exact = ArchiveCardFamilyAutocomplete.normalize_exact_name(raw_query);
				const init_exact = ArchiveCardFamilyAutocomplete.normalize_exact_name(
					this.initial_values.base_card_name
				);
				const matches_known_exact =
					show_all_if_exact &&
					q_exact &&
					(q_exact === init_exact ||
						this.unique_name_items.some((it) => it.exact_key === q_exact));

				if (!q_search || matches_known_exact) {
					return this.unique_name_items.slice(0, this.limit);
				}

				const prefix = [];
				const sub = [];
				for (const item of this.unique_name_items) {
					if (item.search_key.startsWith(q_search)) {
						prefix.push(item);
					} else if (
						item.search_key.includes(q_search) ||
						(item.bank_search_key && item.bank_search_key.includes(q_search))
					) {
						sub.push(item);
					}
				}
				return [...prefix, ...sub].slice(0, this.limit);
			}

			const q_norm = ArchiveCardFamilyAutocomplete.normalize_account(raw_query);
			const q_raw_lower = ArchiveCardFamilyAutocomplete.normalize_digits(raw_query)
				.trim()
				.toLocaleLowerCase();
			const init_acc_norm = ArchiveCardFamilyAutocomplete.normalize_account(
				this.initial_values.account_number
			);
			const matches_known_acc =
				show_all_if_exact &&
				q_norm &&
				(q_norm === init_acc_norm || this.by_norm_account_list.has(q_norm));

			if (!q_norm || matches_known_acc) {
				return this.unique_account_items.slice(0, this.limit);
			}

			const prefix = [];
			const sub = [];
			for (const item of this.unique_account_items) {
				if (item.norm_acc.startsWith(q_norm) || item.raw_lower.startsWith(q_raw_lower)) {
					prefix.push(item);
				} else if (
					item.norm_acc.includes(q_norm) ||
					item.raw_lower.includes(q_raw_lower)
				) {
					sub.push(item);
				}
			}
			return [...prefix, ...sub].slice(0, this.limit);
		}

		async open_suggestions(state, opts = {}) {
			if (!this.is_enabled()) {
				this.hide_menu(state);
				return;
			}
			const el = state.$input[0];
			if (!el || el.readOnly || el.disabled) {
				this.hide_menu(state);
				return;
			}

			if (!this.loaded) {
				await this.ensure_loaded();
				if (this.is_destroyed || document.activeElement !== el) return;
			}

			const raw_query = String(state.$input.val() || "");
			const items = this.filter_items(
				state.fieldname,
				raw_query,
				Boolean(opts.show_all_if_exact)
			);
			this.render_menu(state, items);
		}

		render_menu(state, items) {
			state.items = items;
			state.active_index = -1;

			if (!items.length || !this.is_enabled() || document.activeElement !== state.$input[0]) {
				this.hide_menu(state);
				return;
			}

			const is_acc = state.fieldname === "account_number";
			state.$menu.html(
				items
					.map(
						(item, idx) => `
						<button
							type="button"
							class="acd-autocomplete-item"
							role="option"
							data-index="${idx}"
						>
							<span class="acd-ac-primary" ${is_acc ? 'dir="ltr"' : 'dir="rtl"'}>${frappe.utils.escape_html(
								item.value
							)}</span>
							${
								item.secondary_text
									? `<span class="acd-ac-secondary" dir="rtl">${frappe.utils.escape_html(
											item.secondary_text
									  )}</span>`
									: ""
							}
						</button>
					`
					)
					.join("")
			);

			this.position_menu(state);
			state.$menu.show();
		}

		position_menu(state) {
			const el = state.$input[0];
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const width = Math.max(rect.width, 220);
			const left = Math.max(8, rect.right - width);

			state.$menu.css({
				position: "fixed",
				top: `${rect.bottom + 4}px`,
				left: `${left}px`,
				width: `${width}px`,
				zIndex: 1080,
			});
		}

		handle_keydown(state, e) {
			if (!this.is_enabled()) return;
			const visible = state.$menu.is(":visible") && state.items.length > 0;

			if (e.key === "ArrowDown") {
				if (!visible) {
					e.preventDefault();
					e.stopPropagation();
					this.open_suggestions(state, {
						show_all_if_exact: !state.edited_since_focus,
					});
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				state.active_index = Math.min(state.active_index + 1, state.items.length - 1);
				this.highlight_active(state);
				return;
			}

			if (!visible) return;

			if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				state.active_index = Math.max(state.active_index - 1, 0);
				this.highlight_active(state);
				return;
			}

			if (e.key === "Enter" && state.active_index >= 0) {
				e.preventDefault();
				e.stopPropagation();
				this.select_item(state, state.active_index);
				return;
			}

			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				this.hide_menu(state);
			}
		}

		highlight_active(state) {
			const $btns = state.$menu.find(".acd-autocomplete-item");
			$btns.removeClass("is-active");
			const $cur = $btns.eq(state.active_index);
			$cur.addClass("is-active");
			$cur[0]?.scrollIntoView({ block: "nearest" });
		}

		async select_item(state, index) {
			const item = state.items[index];
			if (!item || !item.family) return;
			const fam = item.family;

			this.hide_menu(state);
			state.edited_since_focus = false;
			this.selected_family = fam;

			if (state.fieldname === "base_card_name") {
				this.fallback_base_card_name = fam.base_card_name;
				this.is_base_autofilled = false;
				this.is_acc_autofilled = true;
				this.is_bank_autofilled = true;
				this.last_account_raw = fam.account_number;
				this.last_bank_raw = fam.bank || "";

				await this.set_control_value(this.controls.base_card_name, fam.base_card_name);
				await this.set_control_value(this.controls.account_number, fam.account_number);
				if (fam.bank && this.controls.bank) {
					await this.set_control_value(this.controls.bank, fam.bank);
				}
			} else {
				this.fallback_account_number = fam.account_number;
				this.last_account_raw = fam.account_number;
				this.last_bank_raw = fam.bank || "";
				this.is_acc_autofilled = false;
				this.is_base_autofilled = true;
				this.is_bank_autofilled = true;

				await this.set_control_value(this.controls.account_number, fam.account_number);
				await this.set_control_value(this.controls.base_card_name, fam.base_card_name);
				if (fam.bank && this.controls.bank) {
					await this.set_control_value(this.controls.bank, fam.bank);
				}
			}

			this.notify_triplet_changed({ immediate: true, matched_family: fam });
		}

		hide_menu(state) {
			state.items = [];
			state.active_index = -1;
			state.$menu.hide().empty();
		}

		hide_all() {
			for (const state of this.states.values()) {
				this.hide_menu(state);
			}
		}

		destroy() {
			this.is_destroyed = true;
			clearTimeout(this._focus_ready_timer);

			for (const state of this.states.values()) {
				state.$input.off(this.ns);
				state.$menu.off(this.ns).remove();
			}
			this.states.clear();
			this.controls.bank?.$input?.off(this.ns);

			$(document).off(this.ns);
			$(window).off(this.ns);
			this.dialog?.$wrapper?.find(".modal-body").off(this.ns);
		}
	}

	const CARD_ASPECT_RATIO = 1.586;

	class ArchiveCardImageEditor {
		static open(options = {}) {
			if (options.can_preview === false) return null;
			if (
				options.can_preview === undefined &&
				typeof frappe?.user?.has_role === "function" &&
				!frappe.user.has_role("صلاحية معاينة البطائق")
			) {
				return null;
			}
			const instance = new ArchiveCardImageEditor(options);
			instance.show();
			return instance;
		}

		static default_meta() {
			return {
				angle: 0,
				quarter_turns: 0,
				zoom: 1,
				pan_x: 0,
				pan_y: 0,
			};
		}

		static normalize_meta(raw) {
			if (!raw || typeof raw !== "object") {
				return ArchiveCardImageEditor.default_meta();
			}
			const angle_num = Number(raw.angle);
			const angle = Number.isFinite(angle_num)
				? Math.max(-45, Math.min(45, Math.round(angle_num * 10) / 10))
				: 0;
			const qt_num = Number(raw.quarter_turns);
			const quarter_turns = Number.isFinite(qt_num)
				? ((Math.round(qt_num) % 4) + 4) % 4
				: 0;
			const zoom_num = Number(raw.zoom);
			const zoom = Number.isFinite(zoom_num)
				? Math.max(1, Math.min(4, Math.round(zoom_num * 1000) / 1000))
				: 1;
			const pan_x_num = Number(raw.pan_x);
			const pan_y_num = Number(raw.pan_y);
			return {
				angle,
				quarter_turns,
				zoom,
				pan_x: Number.isFinite(pan_x_num) ? pan_x_num : 0,
				pan_y: Number.isFinite(pan_y_num) ? pan_y_num : 0,
			};
		}

		static is_default_meta(meta) {
			const m = ArchiveCardImageEditor.normalize_meta(meta);
			return (
				Math.abs(m.angle) < 0.05 &&
				m.quarter_turns === 0 &&
				Math.abs(m.zoom - 1) < 0.005 &&
				Math.abs(m.pan_x) < 0.001 &&
				Math.abs(m.pan_y) < 0.001
			);
		}

		static is_same_meta(a, b) {
			if (!a || !b) return false;
			const ma = ArchiveCardImageEditor.normalize_meta(a);
			const mb = ArchiveCardImageEditor.normalize_meta(b);
			return (
				Math.abs(ma.angle - mb.angle) < 0.05 &&
				ma.quarter_turns === mb.quarter_turns &&
				Math.abs(ma.zoom - mb.zoom) < 0.005 &&
				Math.abs(ma.pan_x - mb.pan_x) < 0.002 &&
				Math.abs(ma.pan_y - mb.pan_y) < 0.002
			);
		}

		static compute_cover_transform(img_w, img_h, frame_w, frame_h, raw_state) {
			const w_i = Math.max(1, Number(img_w) || 1);
			const h_i = Math.max(1, Number(img_h) || 1);
			const w_f = Math.max(1, Number(frame_w) || CARD_ASPECT_RATIO);
			const h_f = Math.max(1, Number(frame_h) || 1);
			const st = ArchiveCardImageEditor.normalize_meta(raw_state);

			const total_deg = st.quarter_turns * 90 + st.angle;
			const theta = (total_deg * Math.PI) / 180;
			const cos_t = Math.cos(theta);
			const sin_t = Math.sin(theta);
			const abs_cos = Math.abs(cos_t);
			const abs_sin = Math.abs(sin_t);

			const p_x = (w_f / 2) * abs_cos + (h_f / 2) * abs_sin;
			const p_y = (w_f / 2) * abs_sin + (h_f / 2) * abs_cos;

			const min_scale = Math.max((2 * p_x) / w_i, (2 * p_y) / h_i);
			const scale = st.zoom * min_scale;

			const half_scaled_w = (scale * w_i) / 2;
			const half_scaled_h = (scale * h_i) / 2;
			const max_u_x = Math.max(0, half_scaled_w - p_x);
			const max_u_y = Math.max(0, half_scaled_h - p_y);

			const raw_dx = st.pan_x * w_f;
			const raw_dy = st.pan_y * h_f;

			const u_x = -raw_dx * cos_t - raw_dy * sin_t;
			const u_y = raw_dx * sin_t - raw_dy * cos_t;

			const clamped_u_x = Math.max(-max_u_x, Math.min(max_u_x, u_x));
			const clamped_u_y = Math.max(-max_u_y, Math.min(max_u_y, u_y));

			const dx = -clamped_u_x * cos_t + clamped_u_y * sin_t;
			const dy = -clamped_u_x * sin_t - clamped_u_y * cos_t;

			const clamped_pan_x = Math.round((dx / w_f) * 100000) / 100000;
			const clamped_pan_y = Math.round((dy / h_f) * 100000) / 100000;

			// Compute native output resolution (1:1 pixel density on original image, no artificial upscaling)
			const unit_px = 0.5 * abs_cos + (0.5 / CARD_ASPECT_RATIO) * abs_sin;
			const unit_py = 0.5 * abs_sin + (0.5 / CARD_ASPECT_RATIO) * abs_cos;
			const unit_min_scale = Math.max((2 * unit_px) / w_i, (2 * unit_py) / h_i);
			const unit_scale = st.zoom * unit_min_scale;
			const native_w = Math.max(64, Math.min(3200, Math.round(1 / unit_scale)));
			const native_h = Math.max(40, Math.round(native_w / CARD_ASPECT_RATIO));

			return {
				angle: st.angle,
				quarter_turns: st.quarter_turns,
				total_deg,
				theta,
				zoom: st.zoom,
				min_scale,
				scale,
				dx,
				dy,
				pan_x: clamped_pan_x,
				pan_y: clamped_pan_y,
				native_w,
				native_h,
			};
		}

		constructor(options = {}) {
			this.side = options.side || "front";
			this.side_label =
				options.side_label || (this.side === "back" ? "الوجه الخلفي" : "الوجه الأمامي");
			this.original_url = options.original_url || "";
			this.saved_meta = options.saved_meta
				? ArchiveCardImageEditor.normalize_meta(options.saved_meta)
				: null;
			this.state = ArchiveCardImageEditor.normalize_meta(
				options.initial_meta || options.saved_meta || ArchiveCardImageEditor.default_meta()
			);
			this.on_apply = options.on_apply || null;

			this.dialog = null;
			this.image = null;
			this.is_loaded = false;
			this.is_applying = false;
			this.mode = "edit"; // "edit" | "preview"
			this.show_grid = true;

			this._is_dragging = false;
			this._drag_start_x = 0;
			this._drag_start_y = 0;
			this._drag_start_pan_x = 0;
			this._drag_start_pan_y = 0;
			this._ns = `.acie_${Math.random().toString(36).slice(2, 9)}`;
		}

		show() {
			this.dialog = new frappe.ui.Dialog({
				title: `معاينة وضبط صورة البطاقة — ${this.side_label}`,
				size: "extra-large",
				primary_action_label: "اعتماد التعديل",
				primary_action: () => {
					this.handle_apply();
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => {
					this.dialog.hide();
				},
			});

			this.dialog.$wrapper.addClass("archive-card-image-editor-modal");
			this.render_shell();
			this.bind_events();

			this.dialog.onhide = () => {
				$(window).off(this._ns);
				$(document).off(this._ns);
			};

			this.dialog.show();
			this.load_original_image();
		}

		render_shell() {
			const $body = $(this.dialog.body);
			$body.attr("dir", "rtl").html(`
				<div class="acie-workspace" dir="rtl" data-mode="edit">
					<div class="acie-topbar">
						<div class="acie-topbar-identity">
							<span class="acie-side-pill">
								<i class="fa fa-id-card-o"></i>
								<span>${frappe.utils.escape_html(this.side_label)}</span>
							</span>
							<span class="acie-meta-chip" data-role="orig-dims-chip">
								<i class="fa fa-picture-o"></i>
								<span data-role="orig-dims-text">جاري تحميل الأصل...</span>
							</span>
							<span class="acie-meta-chip is-aspect" dir="ltr">
								<i class="fa fa-crop"></i> 1.586 : 1
							</span>
						</div>

						<div class="acie-topbar-actions">
							<div class="acie-mode-segmented" role="tablist">
								<button
									type="button"
									class="acie-mode-tab is-active"
									data-action="editor-switch-mode"
									data-target-mode="edit"
								>
									<i class="fa fa-sliders"></i> وضع التحرير
								</button>
								<button
									type="button"
									class="acie-mode-tab"
									data-action="editor-switch-mode"
									data-target-mode="preview"
								>
									<i class="fa fa-eye"></i> معاينة النتيجة
								</button>
							</div>
						</div>
					</div>

					<div class="acie-main-grid">
						<!-- Visual Stage -->
						<div class="acie-stage-panel">
							<div class="acie-stage-header-bar">
								<div class="acie-stage-status" data-role="stage-status-badge">
									<span class="acie-status-dot"></span>
									<span data-role="stage-status-text">اسحب الصورة داخل الإطار لضبط التموضع • عجلة الفأرة للتكبير</span>
								</div>
								<button
									type="button"
									class="acie-grid-toggle-btn is-active"
									data-action="editor-toggle-grid"
									title="إظهار / إخفاء شبكة المحاذاة"
								>
									<i class="fa fa-th"></i>
									<span>شبكة المحاذاة</span>
								</button>
							</div>

							<div class="acie-stage-viewport">
								<div class="acie-crop-frame" data-role="crop-frame">
									<canvas class="acie-canvas" data-role="editor-canvas"></canvas>

									<div class="acie-alignment-grid" data-role="alignment-grid">
										<span class="acie-grid-line is-v is-v1"></span>
										<span class="acie-grid-line is-v is-v2"></span>
										<span class="acie-grid-line is-h is-h1"></span>
										<span class="acie-grid-line is-h is-h2"></span>
										<span class="acie-grid-center-v"></span>
										<span class="acie-grid-center-h"></span>
										<span class="acie-corner is-tl"></span>
										<span class="acie-corner is-tr"></span>
										<span class="acie-corner is-bl"></span>
										<span class="acie-corner is-br"></span>
									</div>

									<div class="acie-preview-clean-badge" data-role="clean-preview-badge" hidden>
										<i class="fa fa-check-circle"></i>
										<span>معاينة النتيجة النهائية المعتمدة للبطاقة</span>
									</div>

									<div class="acie-stage-loading" data-role="stage-loading">
										<i class="fa fa-spinner fa-spin"></i>
										<span>جاري تحميل الصورة الأصلية بأعلى دقة...</span>
									</div>
								</div>
							</div>

							<div class="acie-stage-hud">
								<div class="acie-hud-metrics">
									<span class="acie-hud-pill">
										<small>زاوية التدوير:</small>
										<strong dir="ltr" data-role="hud-angle">0.0°</strong>
									</span>
									<span class="acie-hud-pill">
										<small>مستوى التكبير:</small>
										<strong dir="ltr" data-role="hud-zoom">100%</strong>
									</span>
									<span class="acie-hud-pill">
										<small>دقة الإخراج الفعلية:</small>
										<strong dir="ltr" data-role="hud-out-dims">—</strong>
									</span>
								</div>
								<div class="acie-hud-guarantee">
									<i class="fa fa-shield"></i>
									<span>ملء تلقائي كامل بدون فراغات أو مطّ</span>
								</div>
							</div>
						</div>

						<!-- Control Dock -->
						<div class="acie-controls-dock">
							<!-- Edit Mode Controls -->
							<div class="acie-dock-edit-stack" data-role="dock-edit-stack">
								<!-- Card 1: Rotation -->
								<div class="acie-control-card">
									<div class="acie-card-head">
										<div class="acie-card-title">
											<i class="fa fa-repeat"></i>
											<span>التدوير والمحاذاة</span>
										</div>
										<span class="acie-value-badge" dir="ltr" data-role="angle-badge">0.0°</span>
									</div>

									<div class="acie-quarter-row">
										<button
											type="button"
											class="acie-tool-btn"
											data-action="editor-rotate-90"
											data-dir="-1"
											title="تدوير 90 درجة لليسار"
										>
											<i class="fa fa-undo"></i>
											<span dir="ltr">-90°</span>
										</button>
										<button
											type="button"
											class="acie-tool-btn"
											data-action="editor-rotate-90"
											data-dir="1"
											title="تدوير 90 درجة لليمين"
										>
											<i class="fa fa-repeat"></i>
											<span dir="ltr">+90°</span>
										</button>
										<button
											type="button"
											class="acie-tool-btn is-subtle"
											data-action="editor-zero-fine-angle"
											title="تصفير زاوية الميلان الحر"
										>
											<span>تصفير الميلان</span>
										</button>
									</div>

									<div class="acie-slider-block">
										<div class="acie-slider-labels">
											<span>تدوير حر دقيق</span>
											<span class="acie-slider-range-hint" dir="ltr">-45° .. +45°</span>
										</div>
										<div class="acie-slider-row" dir="ltr">
											<button
												type="button"
												class="acie-step-btn"
												data-action="editor-step-angle"
												data-step="-0.5"
												title="إنقاص 0.5 درجة"
											>
												<i class="fa fa-minus"></i>
											</button>
											<input
												type="range"
												class="acie-range-input"
												data-role="angle-slider"
												min="-45"
												max="45"
												step="0.5"
												value="0"
											/>
											<button
												type="button"
												class="acie-step-btn"
												data-action="editor-step-angle"
												data-step="0.5"
												title="زيادة 0.5 درجة"
											>
												<i class="fa fa-plus"></i>
											</button>
										</div>
									</div>
								</div>

								<!-- Card 2: Zoom -->
								<div class="acie-control-card">
									<div class="acie-card-head">
										<div class="acie-card-title">
											<i class="fa fa-search-plus"></i>
											<span>التكبير والامتلاء</span>
										</div>
										<div class="acie-head-right-group">
											<button
												type="button"
												class="acie-mini-link-btn"
												data-action="editor-reset-zoom"
											>
												100%
											</button>
											<span class="acie-value-badge" dir="ltr" data-role="zoom-badge">100%</span>
										</div>
									</div>

									<div class="acie-slider-row" dir="ltr">
										<button
											type="button"
											class="acie-step-btn"
											data-action="editor-step-zoom"
											data-step="-0.1"
											title="تصغير"
										>
											<i class="fa fa-search-minus"></i>
										</button>
										<input
											type="range"
											class="acie-range-input"
											data-role="zoom-slider"
											min="1"
											max="4"
											step="0.02"
											value="1"
										/>
										<button
											type="button"
											class="acie-step-btn"
											data-action="editor-step-zoom"
											data-step="0.1"
											title="تكبير"
										>
											<i class="fa fa-search-plus"></i>
										</button>
									</div>

									<div class="acie-card-note">
										<i class="fa fa-arrows"></i>
										<span>اسحب الصورة بالفأرة أو اللمس لتحريكها بحرية ضمن حدود الإطار.</span>
									</div>
								</div>

								<!-- Card 3: State Reset / Restore & Mode Switch -->
								<div class="acie-control-card acie-actions-card">
									<div class="acie-card-head">
										<div class="acie-card-title">
											<i class="fa fa-history"></i>
											<span>استعادة الضبط والاعتماد</span>
										</div>
									</div>

									<div class="acie-state-btns-grid">
										<button
											type="button"
											class="acie-state-btn"
											data-action="editor-reset"
										>
											<i class="fa fa-refresh"></i>
											<span>إعادة للأصل</span>
										</button>
										<button
											type="button"
											class="acie-state-btn"
											data-action="editor-restore-saved"
											disabled
										>
											<i class="fa fa-undo"></i>
											<span>آخر حالة محفوظة</span>
										</button>
									</div>

									<button
										type="button"
										class="acie-preview-cta-btn"
										data-action="editor-switch-mode"
										data-target-mode="preview"
									>
										<i class="fa fa-eye"></i>
										<span>معاينة النتيجة النهائية قبل الاعتماد</span>
									</button>
								</div>
							</div>

							<!-- Result Preview Mode Card -->
							<div class="acie-dock-preview-stack" data-role="dock-preview-stack" hidden>
								<div class="acie-control-card acie-preview-summary-card">
									<div class="acie-preview-summary-icon">
										<i class="fa fa-check-circle"></i>
									</div>
									<div class="acie-preview-summary-title">معاينة النتيجة النهائية</div>
									<p class="acie-preview-summary-desc">
										تظهر الصورة الآن تماماً كما ستُعرض داخل خانة
										<strong>${frappe.utils.escape_html(this.side_label)}</strong>
										بنسبة أبعاد البطاقة القياسية وبدون أي حواف فارغة.
									</p>

									<div class="acie-preview-specs-box">
										<div class="acie-spec-row">
											<span>إجمالي زاوية التدوير:</span>
											<strong dir="ltr" data-role="summary-angle">0.0°</strong>
										</div>
										<div class="acie-spec-row">
											<span>مستوى التكبير:</span>
											<strong dir="ltr" data-role="summary-zoom">100%</strong>
										</div>
										<div class="acie-spec-row">
											<span>أبعاد الإخراج من الأصل:</span>
											<strong dir="ltr" data-role="summary-dims">—</strong>
										</div>
									</div>

									<div class="acie-preview-pending-note">
										<i class="fa fa-info-circle"></i>
										<span>
											الضغط على <strong>اعتماد التعديل</strong> يُحدّث الصورة في نافذة البطاقة مؤقتاً، ويتم الحفظ النهائي عند الضغط على زر حفظ البطاقة.
										</span>
									</div>

									<div class="acie-preview-action-stack">
										<button
											type="button"
											class="btn btn-primary btn-block acie-confirm-apply-btn"
											data-action="editor-apply"
										>
											<i class="fa fa-check"></i> اعتماد التعديل
										</button>
										<button
											type="button"
											class="btn btn-default btn-block acie-back-edit-btn"
											data-action="editor-switch-mode"
											data-target-mode="edit"
										>
											<i class="fa fa-sliders"></i> رجوع للتحرير
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			`);
		}

		load_original_image() {
			const $body = $(this.dialog.body);
			const $loading = $body.find('[data-role="stage-loading"]');
			$loading.prop("hidden", false);

			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				this.image = img;
				this.is_loaded = true;
				$loading.prop("hidden", true);
				$body
					.find('[data-role="orig-dims-text"]')
					.text(`الأصل: ${img.naturalWidth} × ${img.naturalHeight} px`);
				this.sync_all_ui();
			};
			img.onerror = () => {
				$loading.prop("hidden", true);
				frappe.msgprint({
					title: "تعذر تحميل الصورة",
					message: "تعذر تحميل الصورة الأصلية للمحرر.",
					indicator: "red",
				});
			};
			img.src = this.original_url;
		}

		bind_events() {
			const $body = $(this.dialog.body);
			const $frame = $body.find('[data-role="crop-frame"]');

			// Mode switch (edit <-> preview)
			$body.on("click", '[data-action="editor-switch-mode"]', (e) => {
				e.preventDefault();
				const target = $(e.currentTarget).attr("data-target-mode") || "edit";
				this.set_mode(target);
			});

			// Toggle alignment grid
			$body.on("click", '[data-action="editor-toggle-grid"]', (e) => {
				e.preventDefault();
				this.show_grid = !this.show_grid;
				this.sync_all_ui();
			});

			// ±90° rotation shortcuts
			$body.on("click", '[data-action="editor-rotate-90"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded || this.mode !== "edit") return;
				const dir = Number($(e.currentTarget).attr("data-dir")) || 1;
				this.state.quarter_turns = (((this.state.quarter_turns + dir) % 4) + 4) % 4;
				this.sync_all_ui();
			});

			// Zero fine angle
			$body.on("click", '[data-action="editor-zero-fine-angle"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded || this.mode !== "edit") return;
				this.state.angle = 0;
				this.sync_all_ui();
			});

			// Fine angle slider & step buttons
			$body.on("input change", '[data-role="angle-slider"]', (e) => {
				if (!this.is_loaded || this.mode !== "edit") return;
				const val = Number(e.currentTarget.value);
				this.state.angle = Number.isFinite(val)
					? Math.max(-45, Math.min(45, Math.round(val * 10) / 10))
					: 0;
				this.sync_all_ui();
			});

			$body.on("click", '[data-action="editor-step-angle"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded || this.mode !== "edit") return;
				const step = Number($(e.currentTarget).attr("data-step")) || 0;
				this.state.angle = Math.max(
					-45,
					Math.min(45, Math.round((this.state.angle + step) * 10) / 10)
				);
				this.sync_all_ui();
			});

			// Zoom slider, step buttons, & 100% reset
			$body.on("input change", '[data-role="zoom-slider"]', (e) => {
				if (!this.is_loaded || this.mode !== "edit") return;
				const val = Number(e.currentTarget.value);
				this.state.zoom = Number.isFinite(val)
					? Math.max(1, Math.min(4, Math.round(val * 1000) / 1000))
					: 1;
				this.sync_all_ui();
			});

			$body.on("click", '[data-action="editor-step-zoom"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded || this.mode !== "edit") return;
				const step = Number($(e.currentTarget).attr("data-step")) || 0;
				this.state.zoom = Math.max(
					1,
					Math.min(4, Math.round((this.state.zoom + step) * 1000) / 1000)
				);
				this.sync_all_ui();
			});

			$body.on("click", '[data-action="editor-reset-zoom"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded || this.mode !== "edit") return;
				this.state.zoom = 1;
				this.sync_all_ui();
			});

			// Reset to original
			$body.on("click", '[data-action="editor-reset"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded) return;
				this.state = ArchiveCardImageEditor.default_meta();
				this.sync_all_ui();
			});

			// Restore last saved state
			$body.on("click", '[data-action="editor-restore-saved"]', (e) => {
				e.preventDefault();
				if (!this.is_loaded || !this.saved_meta) return;
				this.state = ArchiveCardImageEditor.normalize_meta(this.saved_meta);
				this.sync_all_ui();
			});

			// Apply button inside preview panel
			$body.on("click", '[data-action="editor-apply"]', (e) => {
				e.preventDefault();
				this.handle_apply();
			});

			// Mouse wheel zoom on crop frame
			$frame.on("wheel", (e) => {
				if (!this.is_loaded || this.mode !== "edit") return;
				e.preventDefault();
				const orig = e.originalEvent || e;
				const delta = orig.deltaY < 0 ? 0.08 : -0.08;
				this.state.zoom = Math.max(
					1,
					Math.min(4, Math.round((this.state.zoom + delta) * 1000) / 1000)
				);
				this.sync_all_ui();
			});

			// Mouse / Touch Drag to Pan
			const start_drag = (clientX, clientY) => {
				if (!this.is_loaded || this.mode !== "edit") return;
				this._is_dragging = true;
				this._drag_start_x = clientX;
				this._drag_start_y = clientY;
				this._drag_start_pan_x = this.state.pan_x;
				this._drag_start_pan_y = this.state.pan_y;
				$frame.addClass("is-dragging");
			};

			const move_drag = (clientX, clientY) => {
				if (!this._is_dragging || !this.is_loaded || this.mode !== "edit") return;
				const rect = $frame[0]?.getBoundingClientRect();
				if (!rect || !rect.width || !rect.height) return;
				const d_pan_x = (clientX - this._drag_start_x) / rect.width;
				const d_pan_y = (clientY - this._drag_start_y) / rect.height;
				this.state.pan_x = this._drag_start_pan_x + d_pan_x;
				this.state.pan_y = this._drag_start_pan_y + d_pan_y;
				this.sync_all_ui();
			};

			const end_drag = () => {
				if (!this._is_dragging) return;
				this._is_dragging = false;
				$frame.removeClass("is-dragging");
			};

			$frame.on("mousedown", (e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				start_drag(e.clientX, e.clientY);
			});

			$(document).on(`mousemove${this._ns}`, (e) => {
				move_drag(e.clientX, e.clientY);
			});

			$(document).on(`mouseup${this._ns}`, () => {
				end_drag();
			});

			$frame.on("touchstart", (e) => {
				const t = e.originalEvent?.touches?.[0];
				if (!t) return;
				start_drag(t.clientX, t.clientY);
			});

			$(document).on(`touchmove${this._ns}`, (e) => {
				if (!this._is_dragging) return;
				const t = e.originalEvent?.touches?.[0];
				if (!t) return;
				move_drag(t.clientX, t.clientY);
			});

			$(document).on(`touchend${this._ns} touchcancel${this._ns}`, () => {
				end_drag();
			});

			$(window).on(`resize${this._ns}`, () => {
				if (this.is_loaded) {
					this.render_canvas();
				}
			});
		}

		set_mode(mode) {
			this.mode = mode === "preview" ? "preview" : "edit";
			this.sync_all_ui();
		}

		sync_all_ui() {
			if (!this.dialog) return;
			const $body = $(this.dialog.body);
			const is_preview = this.mode === "preview";

			$body.find(".acie-workspace").attr("data-mode", this.mode);
			$body.find('[data-action="editor-switch-mode"]').each((_, el) => {
				const $el = $(el);
				if ($el.hasClass("acie-mode-tab")) {
					$el.toggleClass("is-active", $el.attr("data-target-mode") === this.mode);
				}
			});

			$body.find('[data-role="dock-edit-stack"]').prop("hidden", is_preview);
			$body.find('[data-role="dock-preview-stack"]').prop("hidden", !is_preview);
			$body.find('[data-role="clean-preview-badge"]').prop("hidden", !is_preview);
			$body
				.find('[data-action="editor-toggle-grid"]')
				.prop("hidden", is_preview)
				.toggleClass("is-active", Boolean(this.show_grid));
			$body
				.find('[data-role="alignment-grid"]')
				.prop("hidden", is_preview || !this.show_grid);
			$body
				.find('[data-role="stage-status-text"]')
				.text(
					is_preview
						? "معاينة صافية للنتيجة النهائية — يمكنك الرجوع للتحرير أو اعتماد التعديل"
						: "اسحب الصورة داخل الإطار لضبط التموضع • عجلة الفأرة للتكبير"
				);

			if (!this.is_loaded || !this.image) return;

			// Clamp pan via cover math
			const tf = ArchiveCardImageEditor.compute_cover_transform(
				this.image.naturalWidth,
				this.image.naturalHeight,
				CARD_ASPECT_RATIO * 1000,
				1000,
				this.state
			);
			this.state.pan_x = tf.pan_x;
			this.state.pan_y = tf.pan_y;

			const total_deg_str = `${tf.total_deg >= 0 ? "+" : ""}${tf.total_deg.toFixed(1)}°`;
			const fine_deg_str = `${this.state.angle >= 0 ? "+" : ""}${this.state.angle.toFixed(1)}°`;
			const zoom_pct_str = `${Math.round(this.state.zoom * 100)}%`;
			const out_dims_str = `${tf.native_w} × ${tf.native_h} px`;

			$body.find('[data-role="angle-slider"]').val(String(this.state.angle));
			$body.find('[data-role="zoom-slider"]').val(String(this.state.zoom));
			$body.find('[data-role="angle-badge"]').text(fine_deg_str);
			$body.find('[data-role="zoom-badge"]').text(zoom_pct_str);

			$body.find('[data-role="hud-angle"]').text(total_deg_str);
			$body.find('[data-role="hud-zoom"]').text(zoom_pct_str);
			$body.find('[data-role="hud-out-dims"]').text(out_dims_str);

			$body.find('[data-role="summary-angle"]').text(total_deg_str);
			$body.find('[data-role="summary-zoom"]').text(zoom_pct_str);
			$body.find('[data-role="summary-dims"]').text(out_dims_str);

			const is_def = ArchiveCardImageEditor.is_default_meta(this.state);
			$body.find('[data-action="editor-reset"]').prop("disabled", is_def);
			$body
				.find('[data-action="editor-zero-fine-angle"]')
				.prop("disabled", Math.abs(this.state.angle) < 0.05);
			$body
				.find('[data-action="editor-reset-zoom"]')
				.prop("disabled", Math.abs(this.state.zoom - 1) < 0.005);

			const can_restore =
				Boolean(this.saved_meta) &&
				!ArchiveCardImageEditor.is_same_meta(this.state, this.saved_meta);
			$body.find('[data-action="editor-restore-saved"]').prop("disabled", !can_restore);

			this.render_canvas();
		}

		draw_to_canvas(canvas, target_w, target_h) {
			if (!canvas || !this.image) return null;
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;

			const tf = ArchiveCardImageEditor.compute_cover_transform(
				this.image.naturalWidth,
				this.image.naturalHeight,
				target_w,
				target_h,
				this.state
			);

			ctx.save();
			ctx.fillStyle = "#0f172a";
			ctx.fillRect(0, 0, target_w, target_h);
			ctx.imageSmoothingEnabled = true;
			if ("imageSmoothingQuality" in ctx) {
				ctx.imageSmoothingQuality = "high";
			}

			ctx.translate(target_w / 2 + tf.dx, target_h / 2 + tf.dy);
			ctx.rotate(tf.theta);
			ctx.scale(tf.scale, tf.scale);
			ctx.drawImage(
				this.image,
				-this.image.naturalWidth / 2,
				-this.image.naturalHeight / 2,
				this.image.naturalWidth,
				this.image.naturalHeight
			);
			ctx.restore();
			return tf;
		}

		render_canvas() {
			if (!this.dialog || !this.image) return;
			const $body = $(this.dialog.body);
			const $frame = $body.find('[data-role="crop-frame"]');
			const canvas = $body.find('[data-role="editor-canvas"]')[0];
			if (!canvas || !$frame.length) return;

			const rect = $frame[0].getBoundingClientRect();
			const css_w = Math.max(320, Math.round(rect.width || 620));
			const css_h = Math.max(200, Math.round(css_w / CARD_ASPECT_RATIO));
			const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
			const buf_w = Math.round(css_w * dpr);
			const buf_h = Math.round(css_h * dpr);

			if (canvas.width !== buf_w || canvas.height !== buf_h) {
				canvas.width = buf_w;
				canvas.height = buf_h;
			}
			this.draw_to_canvas(canvas, buf_w, buf_h);
		}

		async export_high_res_file() {
			const tf = ArchiveCardImageEditor.compute_cover_transform(
				this.image.naturalWidth,
				this.image.naturalHeight,
				CARD_ASPECT_RATIO * 1000,
				1000,
				this.state
			);
			const out_canvas = document.createElement("canvas");
			out_canvas.width = tf.native_w;
			out_canvas.height = tf.native_h;
			this.draw_to_canvas(out_canvas, tf.native_w, tf.native_h);

			const blob = await new Promise((resolve, reject) => {
				out_canvas.toBlob(
					(b) => {
						if (b) resolve(b);
						else reject(new Error("تعذر استخراج الصورة المعالجة."));
					},
					"image/jpeg",
					0.95
				);
			});

			const file_name = `card_${this.side}_edited_${Date.now()}.jpg`;
			const file = new File([blob], file_name, { type: "image/jpeg" });
			return {
				file,
				blob,
				edit_meta: {
					angle: tf.angle,
					quarter_turns: tf.quarter_turns,
					zoom: tf.zoom,
					pan_x: tf.pan_x,
					pan_y: tf.pan_y,
				},
			};
		}

		async handle_apply() {
			if (!this.is_loaded || !this.image || this.is_applying) return;
			this.is_applying = true;
			const $primary = this.dialog.get_primary_btn();
			const $applyBtns = $(this.dialog.body).find('[data-action="editor-apply"]');
			$primary.prop("disabled", true);
			$applyBtns.prop("disabled", true);

			try {
				const { file, blob, edit_meta } = await this.export_high_res_file();
				const staged = await upload_staged_card_image(file, this.side);
				const blob_url = URL.createObjectURL(blob);

				if (typeof this.on_apply === "function") {
					await this.on_apply({
						staged,
						blob_url,
						edit_meta,
					});
				}
				frappe.show_alert({
					message: `تم اعتماد تعديل صورة ${this.side_label} بانتظار حفظ البطاقة.`,
					indicator: "blue",
				});
				this.dialog.hide();
			} catch (err) {
				frappe.msgprint({
					title: "خطأ أثناء اعتماد الصورة",
					message: err?.message || "تعذر تجهيز الصورة المعالجة.",
					indicator: "red",
				});
			} finally {
				this.is_applying = false;
				$primary.prop("disabled", false);
				$applyBtns.prop("disabled", false);
			}
		}
	}

	window.ArchiveCardFamilyAutocomplete = ArchiveCardFamilyAutocomplete;
	window.ArchiveCardDailyLimitInput = ArchiveCardDailyLimitInput;
	window.ArchiveCardCreateDialog = ArchiveCardCreateDialog;
	window.ArchiveCardImageEditor = ArchiveCardImageEditor;
	window.upload_staged_card_image = upload_staged_card_image;
})();
