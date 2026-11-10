frappe.ui.form.on("Archive Settings", {
	setup(frm) {
		frm.set_query("default_fiscal_year", () => ({
			filters: { is_closed: 0 },
		}));
	},

	refresh(frm) {
		frm.trigger("render_fiscal_years_manager");
	},

	render_fiscal_years_manager(frm) {
		const field = frm.get_field("fiscal_years_manager_html");
		if (!field || !field.$wrapper) return;

		const $wrap = field.$wrapper;
		$wrap.html(`
			<div class="archive-fy-settings-box" dir="rtl" style="margin-top:8px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff; padding:16px;">
				<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
					<div>
						<div style="font-weight:700; font-size:14px; color:#0f172a;">قائمة السنوات المالية وإدارتها</div>
						<div style="font-size:12px; color:#64748b; margin-top:2px;">السنة المالية تبدأ في 1 يناير وتنتهي في 31 ديسمبر. الإغلاق وإعادة الفتح يدويان بإجراء إداري مسجل.</div>
					</div>
					<div style="display:flex; align-items:center; gap:8px;">
						<input type="text" class="form-control input-sm archive-new-fy-input" placeholder="مثال: 2027" maxlength="4" style="width:120px; text-align:center; font-weight:600;" />
						<button type="button" class="btn btn-primary btn-sm archive-btn-create-fy">
							+ إنشاء سنة جديدة
						</button>
					</div>
				</div>
				<div class="archive-fy-table-slot">
					<div class="text-muted" style="padding:12px; text-align:center;">جاري تحميل السنوات المالية...</div>
				</div>
			</div>
		`);

		const loadAndRender = () => {
			frappe.call({
				method: "archive.services.fiscal_year_permissions.get_fiscal_years_management_data",
				callback(r) {
					const data = (r && r.message) || {};
					const years = Array.isArray(data.fiscal_years) ? data.fiscal_years : [];
					const defaultYear = data.default_fiscal_year || "";
					if (defaultYear && frm.doc.default_fiscal_year !== defaultYear) {
						frm.doc.default_fiscal_year = defaultYear;
						frm.refresh_field("default_fiscal_year");
					}
					renderTable(years, defaultYear);
				},
			});
		};

		const renderTable = (years, defaultYear) => {
			const $slot = $wrap.find(".archive-fy-table-slot");
			if (!years.length) {
				$slot.html(`<div class="text-muted" style="padding:12px; text-align:center;">لا توجد سنوات مالية مسجلة.</div>`);
				return;
			}

			const rowsHtml = years
				.map((y) => {
					const yr = frappe.utils.escape_html(y.year_name);
					const isClosed = Boolean(Number(y.is_closed));
					const isDefault = y.year_name === defaultYear || Boolean(Number(y.is_default));
					const statusBadge = isClosed
						? `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">مغلقة</span>`
						: `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;">مفتوحة</span>`;
					const defaultBadge = isDefault
						? `<span style="display:inline-block; margin-right:6px; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">الافتراضية</span>`
						: "";

					let auditText = "—";
					if (isClosed && y.closed_at) {
						auditText = `أُغلقت بواسطة ${frappe.utils.escape_html(y.closed_by || "")} (${frappe.datetime.str_to_user(y.closed_at)})`;
					} else if (!isClosed && y.reopened_at) {
						auditText = `أُعيد فتحها بواسطة ${frappe.utils.escape_html(y.reopened_by || "")} (${frappe.datetime.str_to_user(y.reopened_at)})`;
					}

					const toggleBtn = isClosed
						? `<button type="button" class="btn btn-xs btn-default archive-fy-toggle-btn" data-year="${yr}" data-close="0" style="color:#059669; border-color:#a7f3d0; font-weight:600;">إعادة فتح السنة</button>`
						: `<button type="button" class="btn btn-xs btn-default archive-fy-toggle-btn" data-year="${yr}" data-close="1" ${isDefault ? 'disabled title="لا يمكن إغلاق السنة الافتراضية قبل اختيار سنة أخرى مفتوحة"' : ""} style="color:#dc2626; border-color:#fecaca; font-weight:600;">إغلاق السنة</button>`;

					const setDefaultBtn =
						!isDefault && !isClosed
							? `<button type="button" class="btn btn-xs btn-default archive-fy-default-btn" data-year="${yr}" style="margin-right:6px; font-weight:600;">تعيين كافتراضية</button>`
							: "";

					return `
						<tr>
							<td style="font-weight:700; font-size:13px;">${yr} ${defaultBadge}</td>
							<td style="direction:ltr; text-align:right;">${frappe.utils.escape_html(y.start_date || "")}</td>
							<td style="direction:ltr; text-align:right;">${frappe.utils.escape_html(y.end_date || "")}</td>
							<td>${statusBadge}</td>
							<td style="font-size:11px; color:#64748b;">${auditText}</td>
							<td style="text-align:left; white-space:nowrap;">${toggleBtn}${setDefaultBtn}</td>
						</tr>
					`;
				})
				.join("");

			$slot.html(`
				<div class="table-responsive">
					<table class="table table-bordered" style="margin-bottom:0; background:#fff;">
						<thead style="background:#f8fafc;">
							<tr>
								<th>السنة المالية</th>
								<th>تاريخ البداية</th>
								<th>تاريخ النهاية</th>
								<th>الحالة</th>
								<th>آخر إجراء إداري</th>
								<th style="text-align:left;">الإجراءات</th>
							</tr>
						</thead>
						<tbody>${rowsHtml}</tbody>
					</table>
				</div>
			`);
		};

		$wrap.off("click.archiveFy").on("click.archiveFy", ".archive-btn-create-fy", () => {
			const val = String($wrap.find(".archive-new-fy-input").val() || "").trim();
			if (!/^\d{4}$/.test(val)) {
				frappe.msgprint(__("يرجى إدخال اسم سنة مالية مكون من 4 أرقام مثل 2027."));
				return;
			}
			frappe.confirm(
				__("هل أنت متأكد من إنشاء السنة المالية ({0}) من {0}-01-01 إلى {0}-12-31؟", [val]),
				() => {
					frappe.call({
						method: "archive.services.fiscal_year_permissions.create_fiscal_year",
						args: { year_name: val },
						freeze: true,
						callback(r) {
							if (!r.exc) {
								$wrap.find(".archive-new-fy-input").val("");
								frappe.show_alert({
									message: __("تم إنشاء السنة المالية {0} بنجاح.", [val]),
									indicator: "green",
								});
								const data = r.message || {};
								renderTable(data.fiscal_years || [], data.default_fiscal_year || "");
							}
						},
					});
				}
			);
		});

		$wrap.on("click.archiveFy", ".archive-fy-toggle-btn", function () {
			const yr = String($(this).attr("data-year") || "").trim();
			const toClose = Number($(this).attr("data-close")) === 1 ? 1 : 0;
			const msg = toClose
				? __("هل أنت متأكد من إغلاق السنة المالية ({0})؟ ستمنع السنة المغلقة جميع عمليات الإضافة والتعديل والحذف.", [yr])
				: __("هل أنت متأكد من إعادة فتح السنة المالية ({0})؟", [yr]);
			frappe.confirm(msg, () => {
				frappe.call({
					method: "archive.services.fiscal_year_permissions.set_fiscal_year_status",
					args: { year_name: yr, is_closed: toClose },
					freeze: true,
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({
								message: toClose
									? __("تم إغلاق السنة المالية {0}.", [yr])
									: __("تمت إعادة فتح السنة المالية {0}.", [yr]),
								indicator: "green",
							});
							const data = r.message || {};
							renderTable(data.fiscal_years || [], data.default_fiscal_year || "");
						}
					},
				});
			});
		});

		$wrap.on("click.archiveFy", ".archive-fy-default-btn", function () {
			const yr = String($(this).attr("data-year") || "").trim();
			frappe.confirm(
				__("هل أنت متأكد من تعيين السنة المالية ({0}) لتكون السنة الافتراضية للإدخال؟", [yr]),
				() => {
					frappe.call({
						method: "archive.services.fiscal_year_permissions.set_default_fiscal_year",
						args: { year_name: yr },
						freeze: true,
						callback(r) {
							if (!r.exc) {
								frm.reload_doc();
								frappe.show_alert({
									message: __("تم تعيين {0} كسنة مالية افتراضية.", [yr]),
									indicator: "green",
								});
							}
						},
					});
				}
			);
		});

		loadAndRender();
	},
});
