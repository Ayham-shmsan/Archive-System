const ADL_RAW_SECTIONS = [
	"activation_section",
	"platform_section",
	"network_section",
	"binding_section",
	"authorized_users_section",
	"security_section",
	"activation_audit_section",
	"notes_section",
];

const ADL_ICONS = {
	shield: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
	shieldAlert: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
	monitor: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
	network: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`,
	users: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
	userPlus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
	key: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
	clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
	copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
	refresh: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
	check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
	pause: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
	play: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
	ban: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
	alert: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
	chevron: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	fileText: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
	save: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
	lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
};

const ADL_STATUS_META = {
	Active: {
		label: "فعّال وموثّق",
		heroPill: "adl-pill--active",
		emblem: "",
		badge: "adl-badge--active",
	},
	Pending: {
		label: "بانتظار التفعيل",
		heroPill: "adl-pill--pending",
		emblem: "adl-hero__emblem--pending",
		badge: "adl-badge--pending",
	},
	Suspended: {
		label: "معلّق مؤقتًا",
		heroPill: "adl-pill--suspended",
		emblem: "adl-hero__emblem--suspended",
		badge: "adl-badge--suspended",
	},
	Mismatch: {
		label: "تغيّرت هوية الجهاز",
		heroPill: "adl-pill--mismatch",
		emblem: "adl-hero__emblem--danger",
		badge: "adl-badge--danger",
	},
	Revoked: {
		label: "ملغي نهائيًا",
		heroPill: "adl-pill--revoked",
		emblem: "adl-hero__emblem--danger",
		badge: "adl-badge--revoked",
	},
};

const ADL_USER_STATUS_META = {
	Active: { label: "مرخّص وفعّال", cls: "adl-badge--active" },
	Pending: { label: "بانتظار الاعتماد", cls: "adl-badge--pending" },
	Suspended: { label: "معلّق", cls: "adl-badge--suspended" },
	Revoked: { label: "ملغي", cls: "adl-badge--revoked" },
};

const ADL_EVENT_LABELS = {
	"Registration Requested": "طلب تسجيل جهاز جديد",
	Activated: "تفعيل ترخيص الجهاز",
	Suspended: "تعليق ترخيص الجهاز",
	Resumed: "استئناف ترخيص الجهاز",
	Revoked: "إلغاء ترخيص الجهاز نهائيًا",
	Restored: "إلغاء إنهاء الترخيص واستعادته",
	Rebound: "اعتماد تغيير الهوية وإعادة الربط",
	"Device Rebound": "اعتماد تغيير الهوية وإعادة الربط",
	"Device Identity Mismatch": "رصد تغيير في هوية الجهاز أو الشبكة",
	"User Authorization Requested": "طلب اعتماد مستخدم على الجهاز",
	"User Approved": "اعتماد مستخدم على الجهاز",
	"User Suspended": "تعليق مستخدم على الجهاز",
	"User Resumed": "استئناف مستخدم على الجهاز",
	"User Revoked": "إلغاء صلاحية مستخدم على الجهاز",
	"Desktop Login Succeeded": "تسجيل دخول ناجح للنظام",
	"Desktop Login Failed": "محاولة دخول ببيانات غير صحيحة",
	"Desktop Login Denied": "رفض دخول مستخدم غير مصرح",
	"Desktop Login Policy Blocked": "منع دخول بسبب قيود الحساب",
	"Active User Unauthorized During Heartbeat": "إنهاء جلسة مستخدم أُوقفت صلاحيته",
};

function adlFormatPlatform(platform, arch) {
	const p = String(platform || "").toLowerCase();
	let name = platform || "غير محدد";
	if (p === "win32") name = "Windows";
	else if (p === "darwin") name = "macOS";
	else if (p === "linux") name = "Linux";
	return arch ? `${name} (${arch})` : name;
}

function adlFormatDt(value) {
	if (!value) return "—";
	try {
		return frappe.datetime.str_to_user(value);
	} catch {
		return String(value);
	}
}

function adlEscape(val) {
	return frappe.utils.escape_html(String(val == null ? "" : val));
}

function adlCopyText(value, label) {
	if (!value) return;
	frappe.utils.copy_to_clipboard(String(value));
	frappe.show_alert({
		message: `تم نسخ ${label || "القيمة"} بنجاح.`,
		indicator: "green",
	});
}

frappe.ui.form.on("Archive Device License", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}

		if (frm.$wrapper) {
			frm.$wrapper.addClass("adl-form-wrapper");
			frm.$wrapper.closest(".page-container").addClass("adl-page-full");
		}
		if (frm.page && frm.page.wrapper) {
			$(frm.page.wrapper).addClass("adl-page-full");
		}

		// إخفاء الأقسام الخام الافتراضية والإبقاء على لوحة التحكم التنفيذية
		ADL_RAW_SECTIONS.forEach((fieldname) => {
			frm.toggle_display(fieldname, false);
		});

		// إبقاء الشريط العلوي نظيفًا لأن كافة الإجراءات موجودة داخل اللوحة التنفيذية
		frm.clear_custom_buttons();

		render_device_license_control_center(frm, frm._adlViewContext || null);

		frappe.call({
			method: "archive.api.device_license.get_device_license_view_context",
			type: "GET",
			args: {
				activation_code: frm.doc.activation_code,
			},
			callback(r) {
				if (r && r.message) {
					frm._adlViewContext = r.message;
					render_device_license_control_center(frm, r.message);
				}
			},
		});
	},
});

function render_device_license_control_center(frm, viewCtx) {
	const field = frm.get_field("license_dashboard_html");
	if (!field || !field.$wrapper) {
		return;
	}

	const $wrap = field.$wrapper;
	const doc = frm.doc;
	const status = String(doc.status || "Pending");
	const meta = ADL_STATUS_META[status] || ADL_STATUS_META.Pending;
	const usersMap = (viewCtx && viewCtx.users_map) || {};
	const events = (viewCtx && Array.isArray(viewCtx.events) && viewCtx.events) || [];
	const wasAccordionOpen = $wrap.find(".adl-accordion").hasClass("is-open");

	const userRows = Array.isArray(doc.user_licenses) ? doc.user_licenses : [];
	const activeUsers = userRows.filter((r) => r.status === "Active");
	const pendingUsers = userRows.filter((r) => r.status === "Pending");

	const resolveUserDisplay = (userId) => {
		const info = usersMap[userId];
		if (!info) {
			return {
				fullName: userId || "—",
				username: "",
				enabled: true,
			};
		}
		return {
			fullName: info.full_name || userId,
			username: info.username || "",
			enabled: info.enabled,
		};
	};

	// أزرار الإجراءات الأساسية في الهيرو حسب حالة الجهاز
	let heroActionsHtml = "";
	if (status === "Pending") {
		heroActionsHtml = `
			<button type="button" class="adl-btn adl-btn--emerald adl-act-activate">
				<span class="adl-icon">${ADL_ICONS.check}</span>
				<span>تفعيل الجهاز وربطه بمستخدم</span>
			</button>
		`;
	} else if (status === "Active") {
		heroActionsHtml = `
			<button type="button" class="adl-btn adl-btn--teal adl-act-approve-user">
				<span class="adl-icon">${ADL_ICONS.userPlus}</span>
				<span>اعتماد مستخدم</span>
			</button>
			<button type="button" class="adl-btn adl-btn--amber-ghost adl-act-suspend">
				<span class="adl-icon">${ADL_ICONS.pause}</span>
				<span>تعليق الترخيص</span>
			</button>
			<button type="button" class="adl-btn adl-btn--danger-ghost adl-act-revoke">
				<span class="adl-icon">${ADL_ICONS.ban}</span>
				<span>إلغاء الترخيص</span>
			</button>
		`;
	} else if (status === "Suspended") {
		heroActionsHtml = `
			<button type="button" class="adl-btn adl-btn--emerald adl-act-resume">
				<span class="adl-icon">${ADL_ICONS.play}</span>
				<span>استئناف الترخيص</span>
			</button>
			<button type="button" class="adl-btn adl-btn--danger-ghost adl-act-revoke">
				<span class="adl-icon">${ADL_ICONS.ban}</span>
				<span>إلغاء الترخيص</span>
			</button>
		`;
	} else if (status === "Mismatch") {
		heroActionsHtml = `
			<button type="button" class="adl-btn adl-btn--emerald adl-act-rebind">
				<span class="adl-icon">${ADL_ICONS.check}</span>
				<span>اعتماد التغيير وإعادة التفعيل</span>
			</button>
			<button type="button" class="adl-btn adl-btn--danger-ghost adl-act-revoke">
				<span class="adl-icon">${ADL_ICONS.ban}</span>
				<span>إلغاء الترخيص</span>
			</button>
		`;
	} else if (status === "Revoked") {
		heroActionsHtml = `
			<button type="button" class="adl-btn adl-btn--emerald adl-act-restore">
				<span class="adl-icon">${ADL_ICONS.play}</span>
				<span>إلغاء الإنهاء واستعادة الترخيص</span>
			</button>
		`;
	}

	heroActionsHtml += `
		<button type="button" class="adl-btn adl-btn--glass adl-act-refresh" title="تحديث البيانات">
			<span class="adl-icon">${ADL_ICONS.refresh}</span>
		</button>
	`;

	// شريط التنبيه الذكي داخل الهيرو
	let heroAlertHtml = "";
	if (status === "Mismatch") {
		heroAlertHtml = `
			<div class="adl-hero-alert adl-hero-alert--danger">
				<div class="adl-hero-alert__body">
					<span class="adl-icon">${ADL_ICONS.alert}</span>
					<span>
						<strong>تنبيه أمني:</strong> ${adlEscape(doc.suspended_reason || "تم اكتشاف تغيير في هوية الجهاز أو بطاقة الشبكة/IP مقارنة بالربط المعتمد.")}
					</span>
				</div>
			</div>
		`;
	} else if (status === "Suspended") {
		heroAlertHtml = `
			<div class="adl-hero-alert adl-hero-alert--warn">
				<div class="adl-hero-alert__body">
					<span class="adl-icon">${ADL_ICONS.alert}</span>
					<span>
						<strong>الترخيص معلّق:</strong> ${adlEscape(doc.suspended_reason || "تم تعليق وصول هذا الجهاز مؤقتًا من قِبل الإدارة.")}
						${doc.suspended_at ? ` · منذ ${adlEscape(adlFormatDt(doc.suspended_at))}` : ""}
					</span>
				</div>
			</div>
		`;
	} else if (status === "Revoked") {
		const revokedWho = doc.revoked_by ? resolveUserDisplay(doc.revoked_by).fullName : "المسؤول";
		heroAlertHtml = `
			<div class="adl-hero-alert adl-hero-alert--danger">
				<div class="adl-hero-alert__body">
					<span class="adl-icon">${ADL_ICONS.alert}</span>
					<span>
						<strong>الترخيص ملغي نهائيًا:</strong>
						تم الإلغاء بواسطة <strong>${adlEscape(revokedWho)}</strong>${doc.revoked_at ? ` · بتاريخ ${adlEscape(adlFormatDt(doc.revoked_at))}` : ""} — يمكنك إلغاء الإنهاء واستعادة الترخيص من الزر أعلاه.
					</span>
				</div>
			</div>
		`;
	} else if (status === "Active" && pendingUsers.length > 0) {
		const firstPending = pendingUsers[0];
		const pDisplay = resolveUserDisplay(firstPending.user);
		const pLabel = pDisplay.username ? `${pDisplay.fullName} (${pDisplay.username})` : pDisplay.fullName;
		heroAlertHtml = `
			<div class="adl-hero-alert adl-hero-alert--warn">
				<div class="adl-hero-alert__body">
					<span class="adl-icon">${ADL_ICONS.alert}</span>
					<span>
						يوجد <strong>${pendingUsers.length}</strong> طلب اعتماد مستخدم بانتظار موافقتك على هذا الجهاز:
						<strong>${adlEscape(pLabel)}</strong>
					</span>
				</div>
				<button type="button" class="adl-btn adl-btn--sm adl-btn--emerald adl-row-approve" data-user="${adlEscape(firstPending.user)}">
					<span class="adl-icon">${ADL_ICONS.check}</span>
					<span>اعتماد الآن</span>
				</button>
			</div>
		`;
	}

	// حالة مطابقة الشبكة
	const macMatched = !doc.licensed_mac || doc.licensed_mac === doc.last_mac;
	const ipMatched = !doc.licensed_ip || doc.licensed_ip === doc.last_reported_ip;
	const networkHealthy = macMatched && ipMatched;

	// جدول المستخدمين المرخصين
	const usersRowsHtml = userRows.length
		? userRows
				.map((row) => {
					const uInfo = resolveUserDisplay(row.user);
					const uStatusMeta = ADL_USER_STATUS_META[row.status] || {
						label: row.status || "—",
						cls: "adl-badge--neutral",
					};
					const firstChar = String(uInfo.fullName || row.user || "م").trim().charAt(0).toUpperCase();
					const disabledTag = !uInfo.enabled
						? ` <span class="adl-badge adl-badge--danger" style="padding:1px 7px; font-size:10px;">حساب معطّل</span>`
						: "";
					const reasonLine =
						row.status === "Suspended" && row.suspended_reason
							? `<div class="adl-user-sub" style="color:#b45309;">السبب: ${adlEscape(row.suspended_reason)}</div>`
							: "";

					let rowActions = "";
					if (status === "Active") {
						if (row.status === "Pending") {
							rowActions = `
								<button type="button" class="adl-btn adl-btn--sm adl-btn--soft-green adl-row-approve" data-user="${adlEscape(row.user)}">اعتماد</button>
								<button type="button" class="adl-btn adl-btn--sm adl-btn--soft-red adl-row-revoke" data-user="${adlEscape(row.user)}">رفض</button>
							`;
						} else if (row.status === "Active") {
							rowActions = `
								<button type="button" class="adl-btn adl-btn--sm adl-btn--soft-amber adl-row-suspend" data-user="${adlEscape(row.user)}">تعليق</button>
								<button type="button" class="adl-btn adl-btn--sm adl-btn--soft-red adl-row-revoke" data-user="${adlEscape(row.user)}">إلغاء</button>
							`;
						} else if (row.status === "Suspended") {
							rowActions = `
								<button type="button" class="adl-btn adl-btn--sm adl-btn--soft-green adl-row-resume" data-user="${adlEscape(row.user)}">استئناف</button>
								<button type="button" class="adl-btn adl-btn--sm adl-btn--soft-red adl-row-revoke" data-user="${adlEscape(row.user)}">إلغاء</button>
							`;
						} else if (row.status === "Revoked") {
							rowActions = `
								<button type="button" class="adl-btn adl-btn--sm adl-btn--outline adl-row-approve" data-user="${adlEscape(row.user)}">إعادة اعتماد</button>
							`;
						}
					} else {
						rowActions = `<span style="color:#94a3b8; font-size:11px;">يتطلب تفعيل الجهاز</span>`;
					}

					return `
						<tr>
							<td>
								<div class="adl-user-cell">
									<div class="adl-avatar">${adlEscape(firstChar)}</div>
									<div>
										<div class="adl-user-name">${adlEscape(uInfo.fullName)}${disabledTag}</div>
										<div class="adl-user-sub">${uInfo.username ? `اسم المستخدم: <span class="adl-mono">${adlEscape(uInfo.username)}</span>` : `<span class="adl-mono">${adlEscape(row.user)}</span>`}</div>
										${reasonLine}
									</div>
								</div>
							</td>
							<td><span class="adl-badge ${uStatusMeta.cls}">${adlEscape(uStatusMeta.label)}</span></td>
							<td style="white-space:nowrap;">${adlEscape(adlFormatDt(row.requested_at))}</td>
							<td style="white-space:nowrap;">${adlEscape(adlFormatDt(row.approved_at))}</td>
							<td style="white-space:nowrap;">${adlEscape(adlFormatDt(row.last_login_at))}</td>
							<td style="text-align:left; white-space:nowrap;">
								<div class="adl-row-actions">${rowActions}</div>
							</td>
						</tr>
					`;
				})
				.join("")
		: `
			<tr>
				<td colspan="6" class="adl-empty">
					لا يوجد مستخدمون مرخّصون على هذا الجهاز حتى الآن.
					${doc.last_requested_user ? `<br><span style="color:#0f172a; font-weight:700;">آخر مستخدم طالب للترخيص: ${adlEscape(doc.last_requested_user)}</span>` : ""}
				</td>
			</tr>
		`;

	// جدول أحدث أحداث التدقيق
	const eventsRowsHtml = events.length
		? events
				.map((ev) => {
					const evLabel = ADL_EVENT_LABELS[ev.event_type] || ev.event_type || "—";
					const evUser = ev.event_user ? resolveUserDisplay(ev.event_user).fullName : "النظام";
					return `
						<tr>
							<td style="font-weight:700; color:#0f172a;">${adlEscape(evLabel)}</td>
							<td style="white-space:nowrap;">${adlEscape(adlFormatDt(ev.event_datetime))}</td>
							<td>${adlEscape(evUser)}</td>
							<td><span class="adl-mono">${adlEscape(ev.source_ip || "—")}</span></td>
						</tr>
					`;
				})
				.join("")
		: `<tr><td colspan="4" class="adl-empty" style="padding:18px;">لا توجد أحداث مسجلة بعد.</td></tr>`;

	const activatedByLabel = doc.activated_by ? resolveUserDisplay(doc.activated_by).fullName : "—";
	const revokedByLabel = doc.revoked_by ? resolveUserDisplay(doc.revoked_by).fullName : "—";

	$wrap.html(`
		<div class="adl-root">

			<!-- 1. EXECUTIVE HERO BANNER -->
			<section class="adl-hero">
				<div class="adl-hero__top">
					<div class="adl-hero__identity">
						<div class="adl-hero__emblem ${meta.emblem}">
							<span class="adl-icon">${status === "Mismatch" || status === "Revoked" ? ADL_ICONS.shieldAlert : ADL_ICONS.shield}</span>
						</div>

						<div style="min-width:0;">
							<div class="adl-hero__title-row">
								<h2 class="adl-hero__title">${adlEscape(doc.device_name || "جهاز غير مسمى")}</h2>
								<span class="adl-pill ${meta.heroPill}">
									<span class="adl-pill__dot"></span>
									<span>${adlEscape(meta.label)}</span>
								</span>
								<span class="adl-hero__code-chip">
									<span class="adl-mono">${adlEscape(doc.activation_code)}</span>
									<button type="button" class="adl-copy-mini adl-copy-btn" data-copy="${adlEscape(doc.activation_code)}" data-label="كود التفعيل" title="نسخ كود التفعيل">
										${ADL_ICONS.copy}
									</button>
								</span>
							</div>

							<div class="adl-hero__meta">
								<span class="adl-hero__meta-item">
									<span class="adl-icon">${ADL_ICONS.monitor}</span>
									<span>${adlEscape(adlFormatPlatform(doc.platform, doc.architecture))}</span>
								</span>
								<span class="adl-hero__meta-item">
									<span class="adl-icon">${ADL_ICONS.network}</span>
									<span>بطاقة الشبكة: <strong>${adlEscape(doc.interface_name || "—")}</strong></span>
								</span>
								<span class="adl-hero__meta-item">
									<span class="adl-icon">${ADL_ICONS.clock}</span>
									<span>آخر ظهور: <strong>${adlEscape(adlFormatDt(doc.last_seen))}</strong></span>
								</span>
							</div>
						</div>
					</div>

					<div class="adl-hero__actions">
						${heroActionsHtml}
					</div>
				</div>

				${heroAlertHtml}
			</section>

			<!-- 2. KPI TELEMETRY STRIP -->
			<section class="adl-kpis">
				<div class="adl-kpi">
					<div class="adl-kpi__head">
						<span>الربط المعتمد للشبكة</span>
						<span class="adl-kpi__icon ${networkHealthy ? "adl-kpi__icon--teal" : "adl-kpi__icon--red"}">${ADL_ICONS.network}</span>
					</div>
					<div class="adl-kpi__value adl-mono">${adlEscape(doc.licensed_ip || doc.last_reported_ip || "—")}</div>
					<div class="adl-kpi__sub adl-mono">MAC: ${adlEscape(doc.licensed_mac || doc.last_mac || "—")}</div>
				</div>

				<div class="adl-kpi">
					<div class="adl-kpi__head">
						<span>المستخدمون المعتمدون</span>
						<span class="adl-kpi__icon adl-kpi__icon--blue">${ADL_ICONS.users}</span>
					</div>
					<div class="adl-kpi__value">
						${activeUsers.length} فعّال${pendingUsers.length ? ` · <span style="color:#d97706;">${pendingUsers.length} بانتظار الاعتماد</span>` : ""}
					</div>
					<div class="adl-kpi__sub">
						${doc.last_requested_user ? `آخر طلب: ${adlEscape(doc.last_requested_user)}` : "إدارة الصلاحيات لكل مستخدم على حدة"}
					</div>
				</div>

				<div class="adl-kpi">
					<div class="adl-kpi__head">
						<span>التحقق التشفيري للجهاز</span>
						<span class="adl-kpi__icon ${doc.key_proven_at ? "adl-kpi__icon--teal" : "adl-kpi__icon--amber"}">${ADL_ICONS.key}</span>
					</div>
					<div class="adl-kpi__value">${doc.key_proven_at ? "موثّق بنجاح ✓" : "بانتظار الإثبات"}</div>
					<div class="adl-kpi__sub">${doc.key_proven_at ? adlEscape(adlFormatDt(doc.key_proven_at)) : "لم يثبت المفتاح الخاص بعد"}</div>
				</div>

				<div class="adl-kpi">
					<div class="adl-kpi__head">
						<span>سجل الظهور</span>
						<span class="adl-kpi__icon">${ADL_ICONS.clock}</span>
					</div>
					<div class="adl-kpi__value">${adlEscape(adlFormatDt(doc.last_seen))}</div>
					<div class="adl-kpi__sub">أول ظهور: ${adlEscape(adlFormatDt(doc.first_seen))}</div>
				</div>
			</section>

			<!-- 3. AUTHORIZED USERS MANAGEMENT CARD -->
			<section class="adl-card">
				<div class="adl-card__header">
					<div class="adl-card__title-wrap">
						<div class="adl-card__icon">${ADL_ICONS.users}</div>
						<div>
							<h3 class="adl-card__title">المستخدمون المرخّصون على هذا الجهاز</h3>
							<p class="adl-card__subtitle">يقتصر الدخول من هذا الجهاز على المستخدمين المعتمدين أدناه فقط؛ وأي مستخدم آخر يتطلب اعتمادًا مستقلًا.</p>
						</div>
					</div>
					${
						status === "Active"
							? `<button type="button" class="adl-btn adl-btn--sm adl-btn--teal adl-act-approve-user">
									<span class="adl-icon">${ADL_ICONS.userPlus}</span>
									<span>اعتماد مستخدم جديد</span>
								</button>`
							: ""
					}
				</div>
				<div class="adl-card__body adl-card__body--flush">
					<div class="adl-table-wrap">
						<table class="adl-table">
							<thead>
								<tr>
									<th>المستخدم</th>
									<th>الحالة</th>
									<th>تاريخ الطلب</th>
									<th>تاريخ الاعتماد</th>
									<th>آخر دخول</th>
									<th style="text-align:left;">الإجراءات</th>
								</tr>
							</thead>
							<tbody>
								${usersRowsHtml}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<!-- 4. TWO-COLUMN DETAILS: NETWORK MATRIX + AUDIT & NOTES -->
			<section class="adl-grid-2">
				<div class="adl-card">
					<div class="adl-card__header">
						<div class="adl-card__title-wrap">
							<div class="adl-card__icon">${ADL_ICONS.network}</div>
							<div>
								<h3 class="adl-card__title">مقارنة بيانات الشبكة والربط المعتمد</h3>
								<p class="adl-card__subtitle">مطابقة فورية بين القيم المسجّلة والمرخّصة وآخر اتصال فعلي من الجهاز</p>
							</div>
						</div>
					</div>
					<div class="adl-card__body adl-card__body--flush">
						<div class="adl-table-wrap">
							<table class="adl-table">
								<thead>
									<tr>
										<th>المؤشر</th>
										<th>عند التسجيل</th>
										<th>الربط المعتمد</th>
										<th>آخر اتصال</th>
										<th>المطابقة</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td style="font-weight:700;">MAC Address</td>
										<td><span class="adl-mono">${adlEscape(doc.initial_mac || "—")}</span></td>
										<td><strong class="adl-mono">${adlEscape(doc.licensed_mac || "—")}</strong></td>
										<td><span class="adl-mono">${adlEscape(doc.last_mac || "—")}</span></td>
										<td>
											${
												doc.licensed_mac
													? macMatched
														? `<span class="adl-match-tag adl-match-tag--ok">مطابق ✓</span>`
														: `<span class="adl-match-tag adl-match-tag--diff">مختلف ✕</span>`
													: `<span class="adl-badge adl-badge--neutral" style="padding:2px 8px; font-size:10.5px;">غير مربوط</span>`
											}
										</td>
									</tr>
									<tr>
										<td style="font-weight:700;">IP المبلغ عنه</td>
										<td><span class="adl-mono">${adlEscape(doc.initial_reported_ip || "—")}</span></td>
										<td><strong class="adl-mono">${adlEscape(doc.licensed_ip || "—")}</strong></td>
										<td><span class="adl-mono">${adlEscape(doc.last_reported_ip || "—")}</span></td>
										<td>
											${
												doc.licensed_ip
													? ipMatched
														? `<span class="adl-match-tag adl-match-tag--ok">مطابق ✓</span>`
														: `<span class="adl-match-tag adl-match-tag--diff">مختلف ✕</span>`
													: `<span class="adl-badge adl-badge--neutral" style="padding:2px 8px; font-size:10.5px;">غير مربوط</span>`
											}
										</td>
									</tr>
									<tr>
										<td style="font-weight:700;">IP المرصود (الخادم)</td>
										<td><span class="adl-mono">${adlEscape(doc.initial_observed_ip || "—")}</span></td>
										<td style="color:#94a3b8;">—</td>
										<td><span class="adl-mono">${adlEscape(doc.last_observed_ip || "—")}</span></td>
										<td><span class="adl-badge adl-badge--neutral" style="padding:2px 8px; font-size:10.5px;">مرجعي</span></td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>

				<div class="adl-card">
					<div class="adl-card__header">
						<div class="adl-card__title-wrap">
							<div class="adl-card__icon">${ADL_ICONS.fileText}</div>
							<div>
								<h3 class="adl-card__title">التدقيق الإداري والملاحظات</h3>
								<p class="adl-card__subtitle">توثيق عمليات التفعيل والتعليق وملاحظات المسؤول</p>
							</div>
						</div>
					</div>
					<div class="adl-card__body">
						<div class="adl-audit-list">
							<div class="adl-audit-item">
								<span class="adl-audit-item__label">التفعيل بواسطة</span>
								<span class="adl-audit-item__val">${adlEscape(activatedByLabel)}${doc.activated_at ? ` · ${adlEscape(adlFormatDt(doc.activated_at))}` : ""}</span>
							</div>
							${
								doc.suspended_at
									? `<div class="adl-audit-item">
											<span class="adl-audit-item__label">آخر تعليق</span>
											<span class="adl-audit-item__val">${adlEscape(adlFormatDt(doc.suspended_at))}</span>
										</div>`
									: ""
							}
							${
								doc.revoked_at
									? `<div class="adl-audit-item">
											<span class="adl-audit-item__label">الإلغاء بواسطة</span>
											<span class="adl-audit-item__val">${adlEscape(revokedByLabel)} · ${adlEscape(adlFormatDt(doc.revoked_at))}</span>
										</div>`
									: ""
							}
						</div>

						<div class="adl-notes-box">
							<label for="adlAdminNotes">ملاحظات الإدارة</label>
							<textarea id="adlAdminNotes" class="adl-notes-textarea" placeholder="أضف ملاحظة إدارية حول هذا الجهاز أو موقعه أو الموظف المسؤول عنه...">${adlEscape(doc.admin_notes || "")}</textarea>
							<div class="adl-notes-actions">
								<button type="button" class="adl-btn adl-btn--sm adl-btn--teal adl-save-notes">
									<span class="adl-icon">${ADL_ICONS.save}</span>
									<span>حفظ الملاحظات</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</section>

			<!-- 5. COLLAPSIBLE CRYPTOGRAPHIC FINGERPRINTS & AUDIT EVENTS -->
			<section class="adl-accordion ${wasAccordionOpen ? "is-open" : ""}">
				<button type="button" class="adl-accordion__toggle">
					<div class="adl-card__title-wrap">
						<div class="adl-card__icon">${ADL_ICONS.lock}</div>
						<div>
							<h3 class="adl-card__title">البصمات التشفيرية وسجل أحداث الجهاز</h3>
							<p class="adl-card__subtitle">معرّف التثبيت، بصمات الهوية والمفتاح العام، وآخر ${events.length} حدث تدقيق أمني</p>
						</div>
					</div>
					<span class="adl-icon adl-accordion__chevron">${ADL_ICONS.chevron}</span>
				</button>

				<div class="adl-accordion__body">
					<div class="adl-fp-grid">
						<div class="adl-fp-item">
							<div class="adl-fp-item__top">
								<span>معرّف التثبيت (Installation ID)</span>
								<button type="button" class="adl-copy-light adl-copy-btn" data-copy="${adlEscape(doc.installation_id || "")}" data-label="معرّف التثبيت">نسخ</button>
							</div>
							<div class="adl-fp-item__code adl-mono">${adlEscape(doc.installation_id || "—")}</div>
						</div>

						<div class="adl-fp-item">
							<div class="adl-fp-item__top">
								<span>بصمة المفتاح العام (Public Key Fingerprint)</span>
								<button type="button" class="adl-copy-light adl-copy-btn" data-copy="${adlEscape(doc.public_key_fingerprint || "")}" data-label="بصمة المفتاح العام">نسخ</button>
							</div>
							<div class="adl-fp-item__code adl-mono">${adlEscape(doc.public_key_fingerprint || "—")}</div>
						</div>

						<div class="adl-fp-item">
							<div class="adl-fp-item__top">
								<span>Machine ID Hash</span>
								<button type="button" class="adl-copy-light adl-copy-btn" data-copy="${adlEscape(doc.machine_id_hash || "")}" data-label="Machine ID Hash">نسخ</button>
							</div>
							<div class="adl-fp-item__code adl-mono">${adlEscape(doc.machine_id_hash || "—")}</div>
						</div>

						<div class="adl-fp-item">
							<div class="adl-fp-item__top">
								<span>Device Fingerprint</span>
								<button type="button" class="adl-copy-light adl-copy-btn" data-copy="${adlEscape(doc.device_fingerprint || "")}" data-label="Device Fingerprint">نسخ</button>
							</div>
							<div class="adl-fp-item__code adl-mono">${adlEscape(doc.device_fingerprint || "—")}</div>
						</div>
					</div>

					<div class="adl-events-list">
						<h4 class="adl-events-heading">آخر أحداث التدقيق الأمني لهذا الجهاز</h4>
						<div class="adl-table-wrap" style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
							<table class="adl-table">
								<thead>
									<tr>
										<th>الحدث</th>
										<th>التاريخ والوقت</th>
										<th>المنفّذ</th>
										<th>IP المصدر</th>
									</tr>
								</thead>
								<tbody>
									${eventsRowsHtml}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</section>

		</div>
	`);

	// ربط جميع الأحداث التفاعلية بشكل نظيف مع إزالة المستمعات السابقة
	$wrap.off(".adl");

	$wrap.on("click.adl", ".adl-copy-btn", function () {
		adlCopyText($(this).attr("data-copy"), $(this).attr("data-label"));
	});

	$wrap.on("click.adl", ".adl-accordion__toggle", function () {
		$(this).closest(".adl-accordion").toggleClass("is-open");
	});

	$wrap.on("click.adl", ".adl-act-refresh", () => {
		frm.reload_doc();
	});

	$wrap.on("click.adl", ".adl-act-activate", () => {
		activate_license(frm);
	});

	$wrap.on("click.adl", ".adl-act-suspend", () => {
		suspend_license(frm);
	});

	$wrap.on("click.adl", ".adl-act-resume", () => {
		resume_license(frm);
	});

	$wrap.on("click.adl", ".adl-act-revoke", () => {
		revoke_license(frm);
	});

	$wrap.on("click.adl", ".adl-act-restore", () => {
		restore_license(frm);
	});

	$wrap.on("click.adl", ".adl-act-rebind", () => {
		rebind_license(frm);
	});

	$wrap.on("click.adl", ".adl-act-approve-user", () => {
		approve_device_user(frm, pendingUsers);
	});

	$wrap.on("click.adl", ".adl-row-approve", async function () {
		const user = String($(this).attr("data-user") || "").trim();
		if (!user) return;
		await frappe.call({
			method: "archive.api.device_license.approve_device_user",
			type: "POST",
			args: {
				activation_code: frm.doc.activation_code,
				user,
			},
			freeze: true,
			freeze_message: "جارٍ اعتماد المستخدم...",
		});
		frappe.show_alert({ message: "تم اعتماد المستخدم على هذا الجهاز بنجاح.", indicator: "green" });
		await frm.reload_doc();
	});

	$wrap.on("click.adl", ".adl-row-suspend", function () {
		const user = String($(this).attr("data-user") || "").trim();
		if (!user) return;
		frappe.prompt(
			[
				{
					fieldname: "reason",
					fieldtype: "Small Text",
					label: "سبب تعليق المستخدم",
					reqd: 1,
				},
			],
			async (values) => {
				await frappe.call({
					method: "archive.api.device_license.suspend_device_user",
					type: "POST",
					args: {
						activation_code: frm.doc.activation_code,
						user,
						reason: values.reason,
					},
					freeze: true,
				});
				frappe.show_alert({ message: "تم تعليق صلاحية المستخدم على الجهاز.", indicator: "orange" });
				await frm.reload_doc();
			},
			"تعليق مستخدم على الجهاز",
			"تعليق"
		);
	});

	$wrap.on("click.adl", ".adl-row-resume", async function () {
		const user = String($(this).attr("data-user") || "").trim();
		if (!user) return;
		await frappe.call({
			method: "archive.api.device_license.resume_device_user",
			type: "POST",
			args: {
				activation_code: frm.doc.activation_code,
				user,
			},
			freeze: true,
		});
		frappe.show_alert({ message: "تم استئناف صلاحية المستخدم بنجاح.", indicator: "green" });
		await frm.reload_doc();
	});

	$wrap.on("click.adl", ".adl-row-revoke", function () {
		const user = String($(this).attr("data-user") || "").trim();
		if (!user) return;
		frappe.confirm(
			`هل تريد إلغاء صلاحية المستخدم <b>${adlEscape(user)}</b> على هذا الجهاز؟`,
			async () => {
				await frappe.call({
					method: "archive.api.device_license.revoke_device_user",
					type: "POST",
					args: {
						activation_code: frm.doc.activation_code,
						user,
					},
					freeze: true,
				});
				frappe.show_alert({ message: "تم إلغاء صلاحية المستخدم على الجهاز.", indicator: "red" });
				await frm.reload_doc();
			}
		);
	});

	$wrap.on("click.adl", ".adl-save-notes", async () => {
		const notesVal = String($wrap.find("#adlAdminNotes").val() || "");
		await frm.set_value("admin_notes", notesVal);
		await frm.save();
		frappe.show_alert({ message: "تم حفظ الملاحظات الإدارية.", indicator: "green" });
	});
}

async function activate_license(frm) {
	const requested = String(frm.doc.last_requested_user || "").trim();

	const dialog = new frappe.ui.Dialog({
		title: "تفعيل الجهاز وربطه بمستخدم",
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "summary",
				options: `
					<div style="margin-bottom: 12px; line-height: 1.8;">
						سيتم ربط الترخيص الحالي بهوية الشبكة التالية:
						<br>
						<b>MAC:</b> ${adlEscape(frm.doc.last_mac || "—")}
						<br>
						<b>IP:</b> ${adlEscape(frm.doc.last_reported_ip || frm.doc.last_observed_ip || "—")}
						${requested ? `<br><b>اسم المستخدم المُدخل من الجهاز:</b> ${adlEscape(requested)}` : ""}
					</div>
				`,
			},
			{
				fieldname: "licensed_user",
				fieldtype: "Link",
				options: "User",
				label: "المستخدم المرخص لهذا الجهاز",
				reqd: 1,
				description: "الربط مسؤولية المسؤول: اختر حساب المستخدم المصرّح له بالدخول من هذا الجهاز.",
				get_query: () => ({
					filters: {
						enabled: 1,
						name: ["!=", "Guest"],
					},
				}),
			},
		],
		primary_action_label: "تفعيل الجهاز",
		primary_action: async (values) => {
			dialog.hide();

			await frappe.call({
				method: "archive.api.device_license.activate_device_license",
				type: "POST",
				args: {
					activation_code: frm.doc.activation_code,
					licensed_user: values.licensed_user,
				},
				freeze: true,
				freeze_message: "جارٍ تفعيل الجهاز وربط المستخدم...",
			});

			frappe.show_alert({ message: "تم تفعيل الجهاز وربطه بالمستخدم بنجاح.", indicator: "green" });
			await frm.reload_doc();
		},
	});

	dialog.show();
}

function approve_device_user(frm, pendingUsers) {
	const defaultPending =
		pendingUsers && pendingUsers.length > 0 ? pendingUsers[0].user : "";

	const pendingNotice =
		pendingUsers && pendingUsers.length > 0
			? `<div style="margin-bottom: 10px; color: #b45309;"><b>طلبات بانتظار الاعتماد:</b> ${pendingUsers.map((r) => adlEscape(r.user)).join("، ")}</div>`
			: "";

	const dialog = new frappe.ui.Dialog({
		title: "اعتماد مستخدم على هذا الجهاز",
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "pending_info",
				options: pendingNotice,
			},
			{
				fieldname: "user",
				fieldtype: "Link",
				options: "User",
				label: "المستخدم",
				reqd: 1,
				default: defaultPending,
				get_query: () => ({
					filters: {
						enabled: 1,
						name: ["!=", "Guest"],
					},
				}),
			},
		],
		primary_action_label: "اعتماد المستخدم",
		primary_action: async (values) => {
			dialog.hide();

			await frappe.call({
				method: "archive.api.device_license.approve_device_user",
				type: "POST",
				args: {
					activation_code: frm.doc.activation_code,
					user: values.user,
				},
				freeze: true,
				freeze_message: "جارٍ اعتماد المستخدم...",
			});

			frappe.show_alert({ message: "تم اعتماد المستخدم على هذا الجهاز.", indicator: "green" });
			await frm.reload_doc();
		},
	});

	dialog.show();
}

function suspend_license(frm) {
	frappe.prompt(
		[
			{
				fieldname: "reason",
				fieldtype: "Small Text",
				label: "سبب التعليق",
				reqd: 1,
			},
		],
		async (values) => {
			await frappe.call({
				method: "archive.api.device_license.suspend_device_license",
				type: "POST",
				args: {
					activation_code: frm.doc.activation_code,
					reason: values.reason,
				},
				freeze: true,
			});

			frappe.show_alert({ message: "تم تعليق ترخيص الجهاز.", indicator: "orange" });
			await frm.reload_doc();
		},
		"تعليق الترخيص",
		"تعليق"
	);
}

async function resume_license(frm) {
	await frappe.call({
		method: "archive.api.device_license.resume_device_license",
		type: "POST",
		args: {
			activation_code: frm.doc.activation_code,
		},
		freeze: true,
	});

	frappe.show_alert({ message: "تم استئناف ترخيص الجهاز بنجاح.", indicator: "green" });
	await frm.reload_doc();
}

function revoke_license(frm) {
	frappe.confirm(
		`
			هل تريد إلغاء هذا الترخيص نهائيًا؟
			<br><br>
			لن يستطيع الجهاز الدخول بعد إلغاء الترخيص.
		`,
		async () => {
			await frappe.call({
				method: "archive.api.device_license.revoke_device_license",
				type: "POST",
				args: {
					activation_code: frm.doc.activation_code,
				},
				freeze: true,
			});

			frappe.show_alert({ message: "تم إلغاء ترخيص الجهاز نهائيًا.", indicator: "red" });
			await frm.reload_doc();
		}
	);
}

function restore_license(frm) {
	const willBeActive = Boolean(
		frm.doc.key_proven_at && frm.doc.licensed_mac && frm.doc.licensed_ip
	);
	const targetLabel = willBeActive
		? "سيعود الترخيص مباشرة إلى حالة <b>فعّال وموثّق</b> بنفس بيانات الربط السابقة."
		: "سيعود الترخيص إلى حالة <b>بانتظار التفعيل</b> لعدم وجود ربط سابق، ويمكنك تفعيله فورًا.";

	frappe.prompt(
		[
			{
				fieldtype: "HTML",
				fieldname: "restore_info",
				options: `<div style="margin-bottom: 10px; line-height: 1.7;">${targetLabel}</div>`,
			},
			{
				fieldname: "reason",
				fieldtype: "Small Text",
				label: "سبب إلغاء الإنهاء واستعادة الترخيص",
				reqd: 1,
			},
		],
		async (values) => {
			const res = await frappe.call({
				method: "archive.api.device_license.restore_device_license",
				type: "POST",
				args: {
					activation_code: frm.doc.activation_code,
					reason: values.reason,
				},
				freeze: true,
				freeze_message: "جارٍ إلغاء الإنهاء واستعادة الترخيص...",
			});

			const nextStatus = res && res.message && res.message.status;
			const msg =
				nextStatus === "Pending"
					? "تم إلغاء الإنهاء وإعادة الترخيص إلى حالة الانتظار لتفعيله."
					: "تم إلغاء الإنهاء واستعادة ترخيص الجهاز بنجاح.";
			frappe.show_alert({ message: msg, indicator: "green" });
			await frm.reload_doc();
		},
		"إلغاء الإنهاء واستعادة الترخيص",
		"استعادة الترخيص"
	);
}

function rebind_license(frm) {
	frappe.confirm(
		`
			سيتم اعتماد هوية الجهاز الحالية وربط الترخيص بها.
			<br><br>
			<b>MAC السابق:</b> ${adlEscape(frm.doc.licensed_mac || "—")}<br>
			<b>MAC الحالي:</b> ${adlEscape(frm.doc.last_mac || "—")}<br><br>
			<b>IP السابق:</b> ${adlEscape(frm.doc.licensed_ip || "—")}<br>
			<b>IP الحالي:</b> ${adlEscape(frm.doc.last_reported_ip || "—")}<br><br>
			هل تريد اعتماد التغيير؟
		`,
		async () => {
			await frappe.call({
				method: "archive.api.device_license.rebind_device_license",
				type: "POST",
				args: {
					activation_code: frm.doc.activation_code,
				},
				freeze: true,
				freeze_message: "جارٍ إعادة ربط الجهاز...",
			});

			frappe.show_alert({ message: "تم اعتماد التغيير وإعادة تفعيل الجهاز.", indicator: "green" });
			await frm.reload_doc();
		}
	);
}
