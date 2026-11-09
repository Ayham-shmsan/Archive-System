(function () {
	"use strict";

	if (window.__archiveUserRolesLoaded) return;
	window.__archiveUserRolesLoaded = true;

	const FALLBACK_CATALOG = {
		containers: [
			{
				id: "cards",
				title: "إدارة البطاقات",
				icon: "credit-card",
				entry_role: "صلاحية عرض البطاقات",
				roles: [
					"صلاحية عرض البطاقات",
					"صلاحية عرض صور البطاقات",
					"صلاحية معاينة البطائق",
					"صلاحية عرض الرقم السري للبطاقات",
					"صلاحية إضافة البطاقات",
					"صلاحية تعديل بيانات البطاقات",
					"صلاحية تعديل صور البطاقات",
					"صلاحية حذف البطاقات",
					"صلاحية تغيير حالة البطاقات",
					"صلاحية إعادة تفعيل البطاقة الموقفة نهائياً",
					"صلاحية نقل البطاقات",
					"صلاحية فرض تمويه صور البطاقات",
					"صلاحية عرض سجل انتقالات البطاقات",
					"صلاحية عرض سجل أحداث البطاقة",
					"صلاحية عرض سجل مستخدم العملية في البطاقات",
				],
			},
			{
				id: "pending_operations",
				title: "العمليات المعلقة",
				icon: "clock",
				entry_role: "صلاحية الوصول إلى شاشة المعلقات",
				roles: [
					"صلاحية الوصول إلى شاشة المعلقات",
					"صلاحية عرض المعلقات الخاصة بالمستخدم",
					"صلاحية عرض جميع المعلقات",
					"صلاحية إضافة عملية معلقة",
					"صلاحية تعديل المعلقات الخاصة بالمستخدم",
					"صلاحية تعديل جميع المعلقات",
					"صلاحية تغيير حالة الفشل في المعلقات",
					"صلاحية إنهاء وإعادة فتح المعلقات",
					"صلاحية إضافة إرجاع في المعلقات",
					"صلاحية تصحيح حركة المبلغ في المعلقات",
					"صلاحية عرض سجل مستخدم العملية في شاشة المعلقات",
				],
			},
			{
				id: "operations",
				title: "إدارة العمليات",
				icon: "layers",
				entry_role: "صلاحية الوصول إلى شاشة العمليات",
				roles: [
					"صلاحية الوصول إلى شاشة العمليات",
					"Archive Viewer",
					"Archive Creator",
					"Archive Editor",
					"Archive Initial Status",
					"Archive Advanced Status",
					"Archive Attachment Manager",
					"Archive Final Swift",
					"صلاحية إرفاق الفاتورة غير المكتملة",
					"صلاحية عرض سجل مستخدم العملية في شاشة العمليات",
				],
			},
			{
				id: "deposits",
				title: "الإيداعات",
				icon: "wallet",
				entry_role: "صلاحية الوصول إلى شاشة الإيداعات",
				roles: [
					"صلاحية الوصول إلى شاشة الإيداعات",
					"صلاحية تعديل إيداعات اليوم",
					"صلاحية تعديل إيداعات الأيام السابقة",
					"صلاحية تعديل إيداعات الأيام القادمة",
				],
			},
			{
				id: "document_authenticity",
				title: "فحص المستندات",
				icon: "shield-check",
				entry_role: "صلاحية الوصول إلى شاشة فحص المستندات",
				roles: [
					"صلاحية الوصول إلى شاشة فحص المستندات",
					"archive document authenticity history",
					"archive document authenticity all history",
					"archive document authenticity check",
					"archive document authenticity technical details",
					"archive document authenticity manager",
				],
			},
			{
				id: "commercial_registries",
				title: "السجلات التجارية",
				icon: "file-text",
				entry_role: "صلاحية عرض شاشة السجلات التجارية",
				roles: [
					"صلاحية عرض شاشة السجلات التجارية",
					"صلاحية إضافة سجل تجاري",
					"صلاحية تعديل السجل للمستخدم",
					"صلاحية تعديل سجلات الآخرين",
					"صلاحية عرض سجلات المستخدم فقط",
					"صلاحية عرض سجلات الآخرين",
					"صلاحية عرض سجل مستخدم العملية",
					"صلاحية حذف سجل تجاري",
				],
			},
		],
		deprecated_roles: [
			"مدير البطاقات",
			"موظف البطاقات",
			"قارئ البطاقات",
			"موظف المعلقات",
			"مشرف المعلقات",
			"مدقق المعلقات المالي",
			"قارئ المعلقات",
		],
	};

	const CONTAINER_ICONS = {
		"credit-card": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
		clock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
		layers: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
		wallet: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
		"shield-check": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
		"file-text": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
		grid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
		section: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
		chevron: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	};

	function getCatalog() {
		const bootCatalog = frappe.boot && frappe.boot.archive_role_containers;
		if (bootCatalog && Array.isArray(bootCatalog.containers) && bootCatalog.containers.length) {
			return bootCatalog;
		}
		return FALLBACK_CATALOG;
	}

	function updateArchiveContainerCounts(rolesEditor) {
		if (!rolesEditor || !rolesEditor.wrapper) return;
		const $wrapper = $(rolesEditor.wrapper);
		const $section = $wrapper.find(".archive-roles-section");
		if (!$section.length) return;

		let grandTotal = 0;
		let grandActive = 0;

		$section.find(".archive-role-card").each(function () {
			const $card = $(this);
			const $checkboxes = $card.find('input[type="checkbox"][data-unit]');
			const total = $checkboxes.length;
			let active = 0;

			$checkboxes.each(function () {
				const isChecked = Boolean(this.checked);
				$(this).closest(".unit-checkbox").toggleClass("is-role-checked", isChecked);
				if (isChecked) {
					active += 1;
				}
			});

			const $entryWrap = $card.find(".archive-role-card__entry-wrap");
			if ($entryWrap.length) {
				const entryChecked = Boolean(
					$entryWrap.find('input[type="checkbox"][data-unit]').prop("checked")
				);
				$entryWrap.toggleClass("is-checked", entryChecked);
			}

			grandTotal += total;
			grandActive += active;

			$card.toggleClass("has-active-roles", active > 0);
			$card.find(".archive-role-card__badge--total").text(`إجمالي الصلاحيات: ${total}`);

			const $activeBadge = $card.find(".archive-role-card__badge--active");
			$activeBadge
				.text(`المفعّلة: ${active} من ${total}`)
				.toggleClass("is-active", active > 0);
		});

		const $summaryBadge = $section.find(".archive-roles-section__summary-badge");
		$summaryBadge
			.text(`المفعّل حاليًا: ${grandActive} من ${grandTotal}`)
			.toggleClass("has-active", grandActive > 0);
	}

	function buildArchiveContainersDOM(rolesEditor) {
		const multicheck = rolesEditor && rolesEditor.multicheck;
		if (!multicheck || !Array.isArray(multicheck.options) || !multicheck.options.length) {
			return;
		}

		const $mcWrapper = $(multicheck.wrapper);
		const catalog = getCatalog();
		const optionsByRole = new Map();
		multicheck.options.forEach((opt) => {
			if (opt && opt.value) {
				optionsByRole.set(opt.value, opt);
			}
		});

		if (!rolesEditor._expandedArchiveContainers) {
			rolesEditor._expandedArchiveContainers = new Set();
		}

		const assignedRoles = new Set();
		const resolvedContainers = [];

		(catalog.containers || []).forEach((containerDef) => {
			const availableRoles = [];
			(containerDef.roles || []).forEach((roleName) => {
				if (optionsByRole.has(roleName) && !assignedRoles.has(roleName)) {
					availableRoles.push(roleName);
					assignedRoles.add(roleName);
				}
			});
			if (availableRoles.length > 0) {
				resolvedContainers.push({
					id: containerDef.id,
					title: containerDef.title,
					icon: containerDef.icon || "grid",
					entry_role:
						containerDef.entry_role && availableRoles.includes(containerDef.entry_role)
							? containerDef.entry_role
							: "",
					roles: availableRoles,
				});
			}
		});

		// Handle deprecated legacy bundled roles: hide if unchecked, or surface in "other_archive" if checked
		const deprecatedRoles = Array.isArray(catalog.deprecated_roles)
			? catalog.deprecated_roles
			: FALLBACK_CATALOG.deprecated_roles;
		const checkedDeprecatedRoles = [];

		deprecatedRoles.forEach((depRole) => {
			if (assignedRoles.has(depRole)) return;
			const opt = optionsByRole.get(depRole);
			if (!opt || !opt.$checkbox) return;
			const isChecked =
				Boolean(opt.checked) ||
				(Array.isArray(multicheck.selected_options) &&
					multicheck.selected_options.includes(depRole));
			if (isChecked) {
				checkedDeprecatedRoles.push(depRole);
				assignedRoles.add(depRole);
			} else {
				opt.$checkbox.detach();
			}
		});

		if (checkedDeprecatedRoles.length > 0) {
			let otherContainer = resolvedContainers.find((c) => c.id === "other_archive");
			if (!otherContainer) {
				otherContainer = {
					id: "other_archive",
					title: "صلاحيات أخرى للأرشفة",
					icon: "grid",
					entry_role: "",
					roles: [],
				};
				resolvedContainers.push(otherContainer);
			}
			checkedDeprecatedRoles.forEach((r) => {
				if (!otherContainer.roles.includes(r)) {
					otherContainer.roles.push(r);
				}
			});
		}

		$mcWrapper.find(".archive-roles-section").remove();
		$mcWrapper.find(".archive-general-roles-header").remove();

		const $section = $(`
			<div class="archive-roles-section" dir="rtl">
				<div class="archive-roles-section__header">
					<div class="archive-roles-section__title-wrap">
						<span class="archive-roles-section__title-icon">${CONTAINER_ICONS.section}</span>
						<div>
							<h4 class="archive-roles-section__title">صلاحيات نظام الأرشفة</h4>
							<p class="archive-roles-section__subtitle">تنظيم صلاحيات الشاشات الخمس بشكل مستقل وقابل للفتح والطي</p>
						</div>
					</div>
					<div class="archive-roles-section__actions">
						<span class="archive-roles-section__summary-badge">المفعّل حاليًا: 0 من 0</span>
						<span class="archive-roles-section__toggle-link" data-archive-action="expand-all" role="button" tabindex="0">توسيع الكل</span>
						<span class="archive-roles-section__toggle-link" data-archive-action="collapse-all" role="button" tabindex="0">طي الكل</span>
					</div>
				</div>
				<div class="archive-roles-containers"></div>
			</div>
		`);

		const $containersWrap = $section.find(".archive-roles-containers");

		resolvedContainers.forEach((container) => {
			const isExpanded = rolesEditor._expandedArchiveContainers.has(container.id);
			const iconSvg = CONTAINER_ICONS[container.icon] || CONTAINER_ICONS.grid;
			const totalCount = container.roles.length;

			const $card = $(`
				<div class="archive-role-card ${isExpanded ? "is-expanded" : ""}" data-container-id="${container.id}">
					<div class="archive-role-card__header" role="button" tabindex="0" aria-expanded="${isExpanded ? "true" : "false"}">
						<div class="archive-role-card__header-main">
							<span class="archive-role-card__icon">${iconSvg}</span>
							<div class="archive-role-card__title-group">
								<span class="archive-role-card__title">${frappe.utils.escape_html(container.title)}</span>
							</div>
						</div>
						<div class="archive-role-card__header-meta">
							<span class="archive-role-card__badge archive-role-card__badge--total">إجمالي الصلاحيات: ${totalCount}</span>
							<span class="archive-role-card__badge archive-role-card__badge--active">المفعّلة: 0 من ${totalCount}</span>
							<span class="archive-role-card__chevron">${CONTAINER_ICONS.chevron}</span>
						</div>
					</div>
					<div class="archive-role-card__body">
						<div class="archive-role-card__grid"></div>
					</div>
				</div>
			`);

			const $body = $card.find(".archive-role-card__body");
			const $grid = $card.find(".archive-role-card__grid");

			container.roles.forEach((roleName) => {
				const opt = optionsByRole.get(roleName);
				if (!opt || !opt.$checkbox) return;

				// Allow clicking the label text inside Archive containers to toggle the checkbox naturally
				opt.$checkbox.find(".label-area").off("click");

				if (container.entry_role && roleName === container.entry_role) {
					const $entryWrap = $(`
						<div class="archive-role-card__entry-wrap">
							<div class="archive-role-card__entry-slot"></div>
							<span class="archive-role-card__entry-tag">صلاحية الدخول إلى الشاشة</span>
						</div>
					`);
					$entryWrap.find(".archive-role-card__entry-slot").append(opt.$checkbox);
					$body.prepend($entryWrap);
				} else {
					$grid.append(opt.$checkbox);
				}
			});

			// Independent expand/collapse without dirtying the form or modifying roles
			$card.find(".archive-role-card__header").on("click keydown", function (e) {
				if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				const nowExpanded = !$card.hasClass("is-expanded");
				$card.toggleClass("is-expanded", nowExpanded);
				$(this).attr("aria-expanded", nowExpanded ? "true" : "false");
				if (nowExpanded) {
					rolesEditor._expandedArchiveContainers.add(container.id);
				} else {
					rolesEditor._expandedArchiveContainers.delete(container.id);
				}
			});

			$containersWrap.append($card);
		});

		$section.find('[data-archive-action="expand-all"]').on("click keydown", function (e) {
			if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			e.stopPropagation();
			$containersWrap.find(".archive-role-card").each(function () {
				const $c = $(this);
				const cid = $c.attr("data-container-id");
				$c.addClass("is-expanded");
				$c.find(".archive-role-card__header").attr("aria-expanded", "true");
				if (cid) rolesEditor._expandedArchiveContainers.add(cid);
			});
		});

		$section.find('[data-archive-action="collapse-all"]').on("click keydown", function (e) {
			if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			e.stopPropagation();
			$containersWrap.find(".archive-role-card").each(function () {
				const $c = $(this);
				const cid = $c.attr("data-container-id");
				$c.removeClass("is-expanded");
				$c.find(".archive-role-card__header").attr("aria-expanded", "false");
				if (cid) rolesEditor._expandedArchiveContainers.delete(cid);
			});
		});

		const $generalHeader = $(`
			<div class="archive-general-roles-header" dir="rtl">
				<span class="archive-general-roles-header__title">الأدوار العامة للنظام</span>
			</div>
		`);

		$mcWrapper.prepend($generalHeader);
		$mcWrapper.prepend($section);

		rolesEditor.set_enable_disable();
		updateArchiveContainerCounts(rolesEditor);
	}

	function enhanceRoleEditorInstance(rolesEditor) {
		if (!rolesEditor || rolesEditor._archiveEnhanced) return;
		if (rolesEditor.table_fieldname && rolesEditor.table_fieldname !== "roles") return;

		const multicheck = rolesEditor.multicheck;
		if (!multicheck) return;

		rolesEditor._archiveEnhanced = true;

		const origMakeCheckboxes = multicheck.make_checkboxes;
		multicheck.make_checkboxes = function () {
			origMakeCheckboxes.apply(this, arguments);
			buildArchiveContainersDOM(rolesEditor);
		};

		const origSelectOptions = multicheck.select_options;
		multicheck.select_options = function () {
			origSelectOptions.apply(this, arguments);
			updateArchiveContainerCounts(rolesEditor);
		};

		// Scope "Select All / Unselect All" buttons above General Roles so they only toggle General Roles
		multicheck.select_all = function (deselect = false) {
			const $generalArea = $(this.$checkbox_area);
			$generalArea.find(':checkbox[data-unit]').each((_, el) => {
				if (!el.disabled) {
					el.checked = !deselect;
				}
			});
			this.selected_options = [];
			(this.options || []).forEach((option) => {
				if (!option.$checkbox) return;
				const cb = option.$checkbox.find(":checkbox").get(0);
				if (cb && cb.checked) {
					this.selected_options.push(option.value);
				}
			});
			updateArchiveContainerCounts(rolesEditor);
			this.df.on_change && this.df.on_change();
		};

		$(rolesEditor.wrapper).on("change.archiveRoles", ":checkbox[data-unit]", function () {
			updateArchiveContainerCounts(rolesEditor);
		});

		// If checkboxes were already rendered before enhancement attached, build immediately
		if (Array.isArray(multicheck.options) && multicheck.options.length > 0) {
			buildArchiveContainersDOM(rolesEditor);
		}
	}

	function patchRoleEditorClass() {
		if (!window.frappe || !frappe.RoleEditor || frappe.RoleEditor._archivePatched) {
			return;
		}
		frappe.RoleEditor._archivePatched = true;
		const origShow = frappe.RoleEditor.prototype.show;
		frappe.RoleEditor.prototype.show = function () {
			enhanceRoleEditorInstance(this);
			const res = origShow.apply(this, arguments);
			updateArchiveContainerCounts(this);
			return res;
		};
	}

	patchRoleEditorClass();

	frappe.ui.form.on("User", {
		onload: function (frm) {
			patchRoleEditorClass();
			if (frm.roles_editor) {
				enhanceRoleEditorInstance(frm.roles_editor);
			}
		},
		refresh: function (frm) {
			patchRoleEditorClass();
			if (frm.roles_editor) {
				enhanceRoleEditorInstance(frm.roles_editor);
				updateArchiveContainerCounts(frm.roles_editor);
			}
		},
	});
})();
