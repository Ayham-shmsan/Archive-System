(() => {
	"use strict";

	class ArchiveCardImageViewer {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.card_title = options.card_title || "صورة البطاقة";
			this.front_url = options.front_url || "";
			this.back_url = options.back_url || "";
			this.active_side = options.initial_side === "back" ? "back" : "front";
			this.single_url = options.image_url || "";

			this.scale = 1;
			this.min_scale = 0.4;
			this.max_scale = 5;
			this.translate_x = 0;
			this.translate_y = 0;
			this.is_dragging = false;
			this.drag_start_x = 0;
			this.drag_start_y = 0;

			this.$overlay = null;
			this._bound_keydown = this._on_keydown.bind(this);
			this._bound_mousemove = this._on_mousemove.bind(this);
			this._bound_mouseup = this._on_mouseup.bind(this);
		}

		static open(options = {}) {
			const viewer = new ArchiveCardImageViewer(options);
			viewer.show();
			return viewer;
		}

		_resolve_current_url() {
			if (this.single_url && !this.front_url && !this.back_url) {
				return this.single_url;
			}
			return this.active_side === "back" ? this.back_url : this.front_url;
		}

		_resolve_side_label() {
			return this.active_side === "back" ? "الوجه الخلفي" : "الوجه الأمامي";
		}

		show() {
			const url = this._resolve_current_url();
			if (!url) {
				frappe.show_alert({
					message: "الصورة غير متوفرة أو ليست لديك صلاحية لعرضها.",
					indicator: "orange",
				});
				return;
			}

			this.destroy();

			const has_both = Boolean(this.front_url && this.back_url);
			const html = `
				<div class="archive-card-img-viewer-overlay" dir="rtl" role="dialog" aria-modal="true">
					<div class="archive-card-img-viewer-header">
						<div class="archive-card-img-viewer-title-group">
							<span class="archive-card-img-viewer-title">${frappe.utils.escape_html(this.card_title)}</span>
							<span class="archive-card-img-viewer-badge" data-role="side-label">${this._resolve_side_label()}</span>
						</div>
						<div class="archive-card-img-viewer-controls">
							${
								has_both
									? `
								<div class="archive-card-img-viewer-side-switch">
									<button type="button" class="aciv-btn ${this.active_side === "front" ? "is-active" : ""}" data-action="side-front">
										الوجه الأمامي
									</button>
									<button type="button" class="aciv-btn ${this.active_side === "back" ? "is-active" : ""}" data-action="side-back">
										الوجه الخلفي
									</button>
								</div>
							`
									: ""
							}
							<div class="archive-card-img-viewer-zoom-group">
								<button type="button" class="aciv-btn" data-action="zoom-out" title="تصغير (-)">
									<i class="fa fa-search-minus"></i>
								</button>
								<span class="aciv-zoom-readout" data-role="zoom-label">100%</span>
								<button type="button" class="aciv-btn" data-action="zoom-in" title="تكبير (+)">
									<i class="fa fa-search-plus"></i>
								</button>
								<button type="button" class="aciv-btn" data-action="zoom-reset" title="الحجم الأصلي (100%)">
									100%
								</button>
								<button type="button" class="aciv-btn" data-action="zoom-fit" title="ملائمة الشاشة">
									ملائمة
								</button>
							</div>
							<button type="button" class="aciv-btn aciv-btn-close" data-action="close" title="إغلاق (Esc)">
								<i class="fa fa-times"></i>
							</button>
						</div>
					</div>
					<div class="archive-card-img-viewer-stage" data-role="stage">
						<div class="archive-card-img-viewer-canvas" data-role="canvas">
							<img
								src="${frappe.utils.escape_html(url)}"
								alt="${frappe.utils.escape_html(this.card_title)}"
								class="archive-card-img-viewer-img"
								data-role="image"
								draggable="false"
							/>
						</div>
					</div>
					<div class="archive-card-img-viewer-footer">
						<span>استخدم عجلة الفأرة للتكبير/التصغير، واسحب الصورة للتنقل عند التكبير.</span>
					</div>
				</div>
			`;

			this.$overlay = $(html).appendTo(document.body);
			this._bind_events();

			if (this._initial_zoom_boost) {
				this.set_scale(1.6);
			}
		}

		_bind_events() {
			if (!this.$overlay) return;

			this.$overlay.on("click", "[data-action]", (e) => {
				e.preventDefault();
				e.stopPropagation();
				const action = $(e.currentTarget).attr("data-action");
				if (action === "close") this.destroy();
				else if (action === "zoom-in") this.zoom_by(0.25);
				else if (action === "zoom-out") this.zoom_by(-0.25);
				else if (action === "zoom-reset") this.reset_transform();
				else if (action === "zoom-fit") this.fit_to_stage();
				else if (action === "side-front") this.switch_side("front");
				else if (action === "side-back") this.switch_side("back");
			});

			const $stage = this.$overlay.find('[data-role="stage"]');
			$stage.on("click", (e) => {
				if (e.target === $stage[0]) {
					this.destroy();
				}
			});

			$stage.on("wheel", (e) => {
				e.preventDefault();
				const orig = e.originalEvent;
				const delta = orig.deltaY < 0 ? 0.2 : -0.2;
				this.zoom_by(delta);
			});

			const $img = this.$overlay.find('[data-role="image"]');
			$img.on("mousedown", (e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				this.is_dragging = true;
				this.drag_start_x = e.clientX - this.translate_x;
				this.drag_start_y = e.clientY - this.translate_y;
				this.$overlay.addClass("is-dragging");
			});

			$img.on("dblclick", (e) => {
				e.preventDefault();
				if (Math.abs(this.scale - 1) < 0.05) {
					this.set_scale(2);
				} else {
					this.reset_transform();
				}
			});

			$(document).on("keydown", this._bound_keydown);
			$(window).on("mousemove", this._bound_mousemove);
			$(window).on("mouseup", this._bound_mouseup);
		}

		_on_mousemove(e) {
			if (!this.is_dragging) return;
			this.translate_x = e.clientX - this.drag_start_x;
			this.translate_y = e.clientY - this.drag_start_y;
			this._apply_transform();
		}

		_on_mouseup() {
			if (!this.is_dragging) return;
			this.is_dragging = false;
			if (this.$overlay) {
				this.$overlay.removeClass("is-dragging");
			}
		}

		_on_keydown(e) {
			if (!this.$overlay) return;
			if (e.key === "Escape") {
				e.preventDefault();
				this.destroy();
			} else if (e.key === "+" || e.key === "=") {
				e.preventDefault();
				this.zoom_by(0.25);
			} else if (e.key === "-") {
				e.preventDefault();
				this.zoom_by(-0.25);
			} else if (e.key === "0") {
				e.preventDefault();
				this.reset_transform();
			}
		}

		switch_side(side) {
			if (side !== "front" && side !== "back") return;
			const target_url = side === "back" ? this.back_url : this.front_url;
			if (!target_url || !this.$overlay) return;

			this.active_side = side;
			this.reset_transform();
			this.$overlay.find('[data-role="image"]').attr("src", target_url);
			this.$overlay.find('[data-role="side-label"]').text(this._resolve_side_label());
			this.$overlay.find('[data-action="side-front"]').toggleClass("is-active", side === "front");
			this.$overlay.find('[data-action="side-back"]').toggleClass("is-active", side === "back");
		}

		zoom_by(delta) {
			this.set_scale(this.scale + delta);
		}

		set_scale(next_scale) {
			this.scale = Math.max(this.min_scale, Math.min(this.max_scale, Number(next_scale) || 1));
			this._apply_transform();
		}

		reset_transform() {
			this.scale = 1;
			this.translate_x = 0;
			this.translate_y = 0;
			this._apply_transform();
		}

		fit_to_stage() {
			this.scale = 0.92;
			this.translate_x = 0;
			this.translate_y = 0;
			this._apply_transform();
		}

		_apply_transform() {
			if (!this.$overlay) return;
			const $canvas = this.$overlay.find('[data-role="canvas"]');
			$canvas.css(
				"transform",
				`translate3d(${this.translate_x}px, ${this.translate_y}px, 0) scale(${this.scale})`
			);
			const pct = Math.round(this.scale * 100);
			this.$overlay.find('[data-role="zoom-label"]').text(`${pct}%`);
		}

		destroy() {
			$(document).off("keydown", this._bound_keydown);
			$(window).off("mousemove", this._bound_mousemove);
			$(window).off("mouseup", this._bound_mouseup);
			if (this.$overlay) {
				this.$overlay.remove();
				this.$overlay = null;
			}
		}
	}

	class ArchiveCardImageContextMenu {
		static hide() {
			$(".archive-card-image-context-menu").remove();
		}

		static bind($container, getOptionsCallback) {
			$container.on("contextmenu", "[data-card-image-surface]", (e) => {
				const opts =
					typeof getOptionsCallback === "function"
						? getOptionsCallback($(e.currentTarget), e)
						: null;
				if (!opts || !opts.can_view_images || !opts.image_url) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				ArchiveCardImageContextMenu.show(e.clientX, e.clientY, opts);
			});
		}

		static show(clientX, clientY, opts = {}) {
			ArchiveCardImageContextMenu.hide();

			const can_replace = Boolean(opts.can_replace && typeof opts.on_replace === "function");
			const menu_html = `
				<div class="archive-card-image-context-menu" dir="rtl" role="menu">
					<button type="button" class="acicm-item" data-menu-action="view-full">
						<i class="fa fa-expand"></i>
						<span>عرض الصورة بالحجم الكامل</span>
					</button>
					<button type="button" class="acicm-item" data-menu-action="view-zoom">
						<i class="fa fa-search-plus"></i>
						<span>فتح في نافذة التكبير</span>
					</button>
					${
						can_replace
							? `
						<div class="acicm-divider"></div>
						<button type="button" class="acicm-item" data-menu-action="replace-image">
							<i class="fa fa-upload"></i>
							<span>تبديل الصورة</span>
						</button>
					`
							: ""
					}
				</div>
			`;

			const $menu = $(menu_html).appendTo(document.body);
			const menu_w = $menu.outerWidth() || 220;
			const menu_h = $menu.outerHeight() || 130;
			const vw = window.innerWidth;
			const vh = window.innerHeight;

			const left = Math.max(12, Math.min(clientX, vw - menu_w - 12));
			const top = Math.max(12, Math.min(clientY, vh - menu_h - 12));
			$menu.css({ left: `${left}px`, top: `${top}px` });

			$menu.on("click", "[data-menu-action]", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				const act = $(ev.currentTarget).attr("data-menu-action");
				ArchiveCardImageContextMenu.hide();

				if (act === "view-full") {
					ArchiveCardImageViewer.open({
						card_name: opts.card_name,
						card_title: opts.card_title,
						front_url: opts.front_url,
						back_url: opts.back_url,
						image_url: opts.image_url,
						initial_side: opts.side || "front",
					});
				} else if (act === "view-zoom") {
					const viewer = new ArchiveCardImageViewer({
						card_name: opts.card_name,
						card_title: opts.card_title,
						front_url: opts.front_url,
						back_url: opts.back_url,
						image_url: opts.image_url,
						initial_side: opts.side || "front",
					});
					viewer._initial_zoom_boost = true;
					viewer.show();
				} else if (act === "replace-image" && can_replace) {
					opts.on_replace(opts.side || "front");
				}
			});

			setTimeout(() => {
				$(document).one("click contextmenu scroll keydown", () => {
					ArchiveCardImageContextMenu.hide();
				});
			}, 10);
		}
	}

	window.ArchiveCardImageViewer = ArchiveCardImageViewer;
	window.ArchiveCardImageContextMenu = ArchiveCardImageContextMenu;
})();
