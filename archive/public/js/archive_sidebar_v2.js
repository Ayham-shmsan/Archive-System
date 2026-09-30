(() => {
    "use strict";


    const SIDEBAR_SELECTOR = [
        '.body-sidebar[data-title="أرشفة وتسهيل"]',
        '.body-sidebar[data-title="الأرشفة"]',
        '.body-sidebar[data-title="Archive"]',
    ].join(",");


    /*
     * Frappe لا يعرض icon للـ Section Break
     * في القالب الافتراضي.
     *
     * لذلك نضيف فقط الأيقونة بصريًا،
     * بينما Collapse/Expand نفسه يبقى Native.
     */
    const SECTION_ICONS =
        Object.freeze({
            "العمليات":
                "briefcase",

            "البيانات الأساسية":
                "folder-normal",

            "النظام":
                "settings",
        });


    const GENERIC_ROLES =
        new Set([
            "All",
            "Guest",
            "Desk User",
        ]);
    
    const HIDDEN_UTILITY_LABELS =
        new Set([
            "Search",
            "Notification",

            "بحث",
            "إعلام",
            "الإشعارات",
        ]);


    let mount_scheduled =
        false;


    function get_sidebar() {

        return document
            .querySelector(
                SIDEBAR_SELECTOR
            );
    }
    function hide_sidebar_utilities(
        sidebar
    ) {

        sidebar
            .querySelectorAll(
                `
                    .standard-sidebar-item,
                    .sidebar-item
                `
            )
            .forEach(
                (item) => {

                    const label =
                        String(
                            item
                                .querySelector(
                                    ".sidebar-item-label"
                                )
                                ?.textContent
                            || ""
                        ).trim();


                    const is_notification =
                        item.classList
                            .contains(
                                "sidebar-notification"
                            );


                    const is_background_tasks =
                        item.classList
                            .contains(
                                "sidebar-background-tasks"
                            );


                    if (
                        is_notification
                        ||
                        is_background_tasks
                        ||
                        HIDDEN_UTILITY_LABELS.has(
                            label
                        )
                    ) {

                        item.classList.add(
                            "archive-sidebar-utility-hidden"
                        );
                    }
                }
            );
    }


    function get_role_label() {

        const roles =
            Array.isArray(
                frappe.user_roles
            )
                ? frappe.user_roles
                : [];


        if (
            roles.includes(
                "System Manager"
            )
        ) {
            return "مدير النظام";
        }


        return (
            roles.find(
                (role) =>
                    role
                    &&
                    !GENERIC_ROLES.has(
                        role
                    )
            )
            ||
            "مستخدم النظام"
        );
    }


    function get_icon_html(
        icon_name,
        size = "sm"
    ) {

        try {

            if (
                frappe?.utils?.icon
            ) {
                return frappe.utils
                    .icon(
                        icon_name,
                        size
                    );
            }

        } catch (
            error
        ) {

            console.warn(
                "Archive sidebar icon failed:",
                icon_name,
                error
            );
        }


        return "";
    }


    function remove_legacy_footer(
        sidebar
    ) {

        /*
         * Footer الذي أنشأناه سابقًا.
         *
         * Frappe لديه Footer أصلي،
         * لذلك نحذف النسخة المكررة فقط.
         */
        sidebar
            .querySelectorAll(
                ".archive-sidebar-user-footer"
            )
            .forEach(
                (element) =>
                    element.remove()
            );
    }


    function sync_section_aria(
        header
    ) {

        const drop_icon =
            header.querySelector(
                ".drop-icon"
            );


        if (
            !drop_icon
            ||
            drop_icon.classList
                .contains(
                    "hidden"
                )
        ) {

            header.removeAttribute(
                "aria-expanded"
            );

            return;
        }


        const state =
            drop_icon.getAttribute(
                "data-state"
            );


        header.setAttribute(
            "aria-expanded",
            state === "closed"
                ? "false"
                : "true"
        );
    }


    function decorate_section(
        section
    ) {

        const header =
            section.querySelector(
                `
                    :scope
                    > .standard-sidebar-item
                    .item-anchor.section-break
                `
            );


        if (!header) {
            return;
        }


        const label_element =
            header.querySelector(
                ".sidebar-item-label"
            );


        const label =
            String(
                label_element
                    ?.textContent
                || ""
            ).trim();


        if (!label) {
            return;
        }


        /*
         * أيقونة عنوان القسم.
         */
        const icon_name =
            SECTION_ICONS[
                label
            ];


        if (
            icon_name
            &&
            !header.querySelector(
                ".archive-sidebar-section-icon"
            )
        ) {

            const icon =
                document.createElement(
                    "span"
                );


            icon.className =
                "archive-sidebar-section-icon";


            const markup =
                get_icon_html(
                    icon_name,
                    "sm"
                );


            if (markup) {

                icon.innerHTML =
                    markup;

            } else {

                icon.textContent =
                    "•";
            }


            header.insertBefore(
                icon,
                label_element
            );
        }


        /*
         * Accessibility فقط.
         *
         * Click الحقيقي يبقى من Frappe.
         */
        header.setAttribute(
            "role",
            "button"
        );


        header.setAttribute(
            "tabindex",
            "0"
        );


        if (
            !header.dataset
                .archiveKeyboardBound
        ) {

            header.addEventListener(
                "keydown",
                (event) => {

                    if (
                        event.target
                        !== header
                    ) {
                        return;
                    }


                    if (
                        event.key
                            !== "Enter"
                        &&
                        event.key
                            !== " "
                    ) {
                        return;
                    }


                    event.preventDefault();


                    header
                        .closest(
                            ".standard-sidebar-item"
                        )
                        ?.click();
                }
            );


            header.addEventListener(
                "click",
                () => {

                    requestAnimationFrame(
                        () => {
                            sync_section_aria(
                                header
                            );
                        }
                    );
                }
            );


            header.dataset
                .archiveKeyboardBound =
                    "1";
        }


        sync_section_aria(
            header
        );
    }


    function decorate_sections(
        sidebar
    ) {

        sidebar
            .querySelectorAll(
                ".section-item"
            )
            .forEach(
                decorate_section
            );
    }


    function decorate_native_user(
        sidebar
    ) {

        const button =
            sidebar.querySelector(
                ".sidebar-user-button"
            );


        if (!button) {
            return;
        }


        button.classList.add(
            "archive-sidebar-native-user"
        );


        /*
         * نستخدم Footer Frappe الأصلي،
         * ونستبدل البريد في السطر الثاني
         * بالدور كما اتفقنا.
         */
        const meta =
            button.querySelector(
                ".avatar-name-email"
            );


        const lines =
            meta
                ?.querySelectorAll(
                    ":scope > span"
                );


        if (
            lines
            &&
            lines.length > 1
        ) {

            lines[1].textContent =
                get_role_label();
        }


        /*
         * سهم صغير في نهاية Footer.
         */
        if (
            !button.querySelector(
                ".archive-sidebar-native-user-arrow"
            )
        ) {

            const arrow =
                document.createElement(
                    "span"
                );


            arrow.className =
                "archive-sidebar-native-user-arrow";


            arrow.setAttribute(
                "aria-hidden",
                "true"
            );


            const markup =
                get_icon_html(
                    "chevron-down",
                    "xs"
                );


            if (markup) {

                arrow.innerHTML =
                    markup;

            } else {

                arrow.textContent =
                    "⌄";
            }


            button.appendChild(
                arrow
            );
        }
    }


    function decorate_links(
        sidebar
    ) {

        /*
         * Frappe لديه Tooltip أصلي أصلًا
         * على Sidebar Item Container.
         *
         * نضيف aria-label للرابط فقط.
         */
        sidebar
            .querySelectorAll(
                `
                    .nested-container
                    .item-anchor
                `
            )
            .forEach(
                (anchor) => {

                    const label =
                        String(
                            anchor
                                .querySelector(
                                    ".sidebar-item-label"
                                )
                                ?.textContent
                            || ""
                        ).trim();


                    if (label) {

                        anchor.setAttribute(
                            "aria-label",
                            label
                        );
                    }
                }
            );
    }


    function sync_archive_toggle(
    button
) {

    const container =
        document.querySelector(
            ".body-sidebar-container"
        );


    const expanded =
        Boolean(
            container
                ?.classList
                .contains(
                    "expanded"
                )
        );


    const is_rtl =
        Boolean(
            frappe?.utils
                ?.is_rtl?.()
        );


    const icon_name =
        expanded
            ? (
                is_rtl
                    ? "chevron-right"
                    : "chevron-left"
            )
            : (
                is_rtl
                    ? "chevron-left"
                    : "chevron-right"
            );


    const label =
        expanded
            ? "طي الشريط الجانبي"
            : "توسيع الشريط الجانبي";


    button.innerHTML =
        get_icon_html(
            icon_name,
            "sm"
        )
        || (
            expanded
                ? "‹"
                : "›"
        );


    button.setAttribute(
        "title",
        label
    );


    button.setAttribute(
        "aria-label",
        label
    );


    button.setAttribute(
        "aria-expanded",
        expanded
            ? "true"
            : "false"
    );
}


function decorate_toggle(
        sidebar
    ) {

        const footer =
            sidebar.querySelector(
                ".body-sidebar-bottom"
            );


        if (!footer) {
            return;
        }


        let button =
            footer.querySelector(
                ".archive-sidebar-toggle"
            );

        if (!button) {

            button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "archive-sidebar-toggle";


            button.addEventListener(
                "click",
                (event) => {

                    /*
                    * لا نريد أن تُفتح قائمة
                    * اختيار الـWorkspace في الهيدر.
                    */
                    event.preventDefault();
                    event.stopPropagation();


                    const native_sidebar =
                        frappe
                            ?.app
                            ?.sidebar;


                    if (
                        typeof native_sidebar
                            ?.toggle_width
                            === "function"
                    ) {

                        native_sidebar
                            .toggle_width();
                    }


                    requestAnimationFrame(
                        () => {

                            sync_archive_toggle(
                                button
                            );
                        }
                    );
                }
            );


            footer.appendChild(
                    button
                );
        }


        sync_archive_toggle(
            button
        );
    }


    function mount() {

        const sidebar =
            get_sidebar();


        if (!sidebar) {
            return;
        }


        sidebar.classList.add(
            "archive-sidebar-enhanced"
        );


        remove_legacy_footer(
            sidebar
        );

        hide_sidebar_utilities(
            sidebar
        );


        decorate_sections(
            sidebar
        );


        decorate_native_user(
            sidebar
        );


        decorate_links(
            sidebar
        );


        decorate_toggle(
            sidebar
        );
    }


    function schedule_mount() {

        if (mount_scheduled) {
            return;
        }


        mount_scheduled =
            true;


        requestAnimationFrame(
            () => {

                mount_scheduled =
                    false;

                mount();
            }
        );
    }


    if (
        document.readyState
        === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            schedule_mount,
            {
                once:
                    true,
            }
        );

    } else {

        schedule_mount();
    }


    window.addEventListener(
        "load",
        schedule_mount,
        {
            once:
                true,
        }
    );
    /*
    * Frappe يطلق هذا الحدث بعد
    * Expand / Collapse.
    *
    * نستخدمه فقط لتحديث شكل زرنا.
    */
    $(document)
        .off(
            "sidebar-expand.archive_sidebar_v2"
        )
        .on(
            "sidebar-expand.archive_sidebar_v2",
            () => {

                schedule_mount();
            }
        );


    /*
     * Frappe يعيد بناء Sidebar عند بعض
     * أنواع التنقل، لذلك نعيد Decoration
     * بطريقة idempotent.
     */
    const observer =
        new MutationObserver(
            schedule_mount
        );


    observer.observe(
        document.body,
        {
            childList:
                true,

            subtree:
                true,
        }
    );
})();