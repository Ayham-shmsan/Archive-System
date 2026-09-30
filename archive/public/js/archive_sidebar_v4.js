(() => {
    "use strict";


    /* =========================================================
       CONSTANTS
       ========================================================= */

    const SIDEBAR_SELECTOR = [
        '.body-sidebar[data-title="أرشفة وتسهيل"]',
        '.body-sidebar[data-title="الأرشفة"]',
        '.body-sidebar[data-title="Archive"]',
    ].join(",");


    const STORAGE_PREFIX =
        "archive.sidebar.v3";


    const BREAKPOINTS = {
        mobile:
            768,

        desktop:
            1200,
    };


    const GENERIC_ROLES =
        new Set([
            "All",
            "Guest",
            "Desk User",
        ]);


    const UTILITY_LABELS =
        new Set([
            "Search",
            "Notification",
            "Notifications",

            "بحث",
            "إعلام",
            "الإشعارات",
        ]);


    const SECTION_META = {
        operations: {
            labels:
                new Set([
                    "العمليات",
                    "Operations",
                ]),

            icon:
                "briefcase",

            routes: [
                "archive-operations",
                "archive-pending-operations",
                "document-authenticity",
            ],
        },

        masters: {
            labels:
                new Set([
                    "البيانات الأساسية",
                    "Master Data",
                    "Masters",
                ]),

            icon:
                "folder-normal",

            routes: [
                "archive-account",
                "archive-bank",
                "archive-region",
                "archive-representative",
                "archive-customer",
            ],
        },

        system: {
            labels:
                new Set([
                    "النظام",
                    "System",
                ]),

            icon:
                "settings",

            routes: [
                "system-settings",
                "archive-settings",
            ],
        },
    };


    /* =========================================================
       STATE
       ========================================================= */

    const state = {
        mounted:
            false,

        render_scheduled:
            false,

        environment: {
            viewport:
                "desktop",

            direction:
                "ltr",

            placement:
                "left",
        },

        mode:
            "expanded",

        desktop_preference:
            null,

        tablet_expanded:
            false,

        sidebar:
            null,

        container:
            null,

        sidebar_observer:
            null,

        document_observer:
            null,

        resize_observer:
            null,

        bootstrap_observer:
            null,
    };


    /* =========================================================
       STORAGE
       ========================================================= */

    function get_user_key() {

        const user =
            String(
                frappe?.session?.user
                || "guest"
            ).trim();


        return (
            `${STORAGE_PREFIX}.mode.${user}`
        );
    }


    function read_desktop_preference() {

        try {

            const value =
                localStorage.getItem(
                    get_user_key()
                );


            if (
                value === "expanded"
                ||
                value === "compact"
            ) {
                return value;
            }

        } catch (
            error
        ) {

            console.warn(
                "Archive sidebar: could not read preference.",
                error
            );
        }


        return null;
    }


    function save_desktop_preference(
        mode
    ) {

        if (
            mode !== "expanded"
            &&
            mode !== "compact"
        ) {
            return;
        }


        try {

            localStorage.setItem(
                get_user_key(),
                mode
            );

        } catch (
            error
        ) {

            console.warn(
                "Archive sidebar: could not save preference.",
                error
            );
        }
    }


    /* =========================================================
       DOM HELPERS
       ========================================================= */

    function get_sidebar() {

        return document
            .querySelector(
                SIDEBAR_SELECTOR
            );
    }


    function get_container(
        sidebar
    ) {

        return sidebar
            ?.closest(
                ".body-sidebar-container"
            )
            || null;
    }


    function get_icon_html(
        icon_name,
        size = "sm"
    ) {

        try {

            if (
                typeof frappe
                    ?.utils
                    ?.icon
                === "function"
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


    function get_role_label() {

        const roles =
            Array.isArray(
                frappe?.user_roles
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


    /* =========================================================
       ENVIRONMENT
       ========================================================= */

    function read_direction() {

        const html =
            document.documentElement;


        const direction =
            String(
                html.getAttribute(
                    "dir"
                )
                ||
                getComputedStyle(
                    html
                ).direction
                ||
                "ltr"
            )
            .trim()
            .toLowerCase();


        return (
            direction === "rtl"
                ? "rtl"
                : "ltr"
        );
    }


    function read_viewport() {

        const width =
            window.innerWidth;


        if (
            width
            <
            BREAKPOINTS.mobile
        ) {
            return "mobile";
        }


        if (
            width
            <
            BREAKPOINTS.desktop
        ) {
            return "tablet";
        }


        return "desktop";
    }


    function detect_sidebar_placement(
        sidebar
    ) {

        if (!sidebar) {

            return (
                read_direction()
                === "rtl"
                    ? "right"
                    : "left"
            );
        }


        const rect =
            sidebar
                .getBoundingClientRect();


        const distance_left =
            Math.abs(
                rect.left
            );


        const distance_right =
            Math.abs(
                window.innerWidth
                -
                rect.right
            );


        /*
         * لا نفترض RTL = right
         * أو LTR = left.
         *
         * نقيس الموضع الحقيقي.
         */
        if (
            distance_left
            <
            distance_right
        ) {
            return "left";
        }


        if (
            distance_right
            <
            distance_left
        ) {
            return "right";
        }


        return (
            read_direction()
            === "rtl"
                ? "right"
                : "left"
        );
    }


    function read_environment() {

        return {
            viewport:
                read_viewport(),

            direction:
                read_direction(),

            placement:
                detect_sidebar_placement(
                    state.sidebar
                ),
        };
    }


    /* =========================================================
       FRAPPE NATIVE VISIBILITY
       ========================================================= */

    function ensure_native_sidebar_open() {

        const container =
            state.container;


        if (!container) {
            return;
        }


        if (
            container.classList
                .contains(
                    "expanded"
                )
        ) {
            return;
        }


        const native_sidebar =
            frappe
                ?.app
                ?.sidebar;


        if (
            typeof native_sidebar
                ?.open
            === "function"
        ) {

            try {

                native_sidebar.open();

                return;

            } catch (
                error
            ) {

                console.warn(
                    "Archive sidebar: native open failed.",
                    error
                );
            }
        }


        /*
         * Defensive fallback.
         */
        container.classList
            .add(
                "expanded"
            );
    }


    function release_to_native_mobile() {

        const container =
            state.container;


        if (!container) {
            return;
        }


        /*
         * على Mobile نخرج من Compact/Expanded
         * الخاص بنا ونترك Frappe يدير Drawer.
         */
        container.classList
            .remove(
                "archive-sidebar-expanded",
                "archive-sidebar-compact"
            );


        const native_sidebar =
            frappe
                ?.app
                ?.sidebar;


        if (
            typeof native_sidebar
                ?.close
            === "function"
        ) {

            try {

                native_sidebar.close();

                return;

            } catch (
                error
            ) {

                console.warn(
                    "Archive sidebar: native close failed.",
                    error
                );
            }
        }
    }


    /* =========================================================
       STATE DERIVATION
       ========================================================= */

    function derive_mode() {

        const viewport =
            state.environment
                .viewport;


        if (
            viewport
            === "mobile"
        ) {
            return "mobile";
        }


        if (
            viewport
            === "tablet"
        ) {

            return (
                state.tablet_expanded
                    ? "expanded"
                    : "compact"
            );
        }


        /*
         * Desktop:
         *
         * تفضيل المستخدم إن وجد،
         * وإلا Expanded افتراضيًا.
         */
        return (
            state.desktop_preference
            ||
            "expanded"
        );
    }


    /* =========================================================
       SECTION IDENTITY
       ========================================================= */

    function identify_section(
        section
    ) {

        const label =
            String(
                section
                    .querySelector(
                        ".sidebar-item-label"
                    )
                    ?.textContent
                || ""
            ).trim();


        for (
            const [
                key,
                meta,
            ]
            of Object.entries(
                SECTION_META
            )
        ) {

            if (
                meta.labels.has(
                    label
                )
            ) {
                return key;
            }
        }


        /*
         * Fallback بالـroutes.
         *
         * حتى لو تغيرت الترجمة تمامًا.
         */
        const links =
            [
                ...section
                    .querySelectorAll(
                        "a[href]"
                    ),
            ]
            .map(
                (anchor) =>
                    String(
                        anchor.getAttribute(
                            "href"
                        )
                        || ""
                    )
                    .toLowerCase()
            );


        for (
            const [
                key,
                meta,
            ]
            of Object.entries(
                SECTION_META
            )
        ) {

            const found =
                meta.routes.some(
                    (route) =>
                        links.some(
                            (href) =>
                                href.includes(
                                    route
                                )
                        )
                );


            if (found) {
                return key;
            }
        }


        return "";
    }


    /* =========================================================
       DECORATION
       ========================================================= */

    function hide_utility_items(
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


                    const hidden_by_class =
                        (
                            item.classList
                                .contains(
                                    "sidebar-notification"
                                )
                            ||
                            item.classList
                                .contains(
                                    "sidebar-background-tasks"
                                )
                        );


                    if (
                        hidden_by_class
                        ||
                        UTILITY_LABELS.has(
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


    function decorate_sections(
        sidebar
    ) {

        sidebar
            .querySelectorAll(
                ".section-item"
            )
            .forEach(
                (section) => {

                    const key =
                        identify_section(
                            section
                        );


                    if (!key) {
                        return;
                    }


                    section.dataset
                        .archiveSection =
                            key;


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


                    const label =
                        header.querySelector(
                            ".sidebar-item-label"
                        );


                    if (!label) {
                        return;
                    }


                    const meta =
                        SECTION_META[
                            key
                        ];


                    let icon =
                        header.querySelector(
                            ".archive-sidebar-section-icon"
                        );


                    if (!icon) {

                        icon =
                            document.createElement(
                                "span"
                            );


                        icon.className =
                            "archive-sidebar-section-icon";


                        label.before(
                            icon
                        );
                    }


                    if (
                        !icon.dataset
                            .archiveRendered
                    ) {

                        const markup =
                            get_icon_html(
                                meta.icon,
                                "sm"
                            );


                        icon.innerHTML =
                            markup
                            ||
                            "<span>•</span>";


                        icon.dataset
                            .archiveRendered =
                                "1";
                    }
                }
            );
    }


    function decorate_links(
        sidebar
    ) {

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


                    if (!label) {
                        return;
                    }


                    anchor.setAttribute(
                        "aria-label",
                        label
                    );


                    anchor.setAttribute(
                        "title",
                        label
                    );
                }
            );
    }


    function decorate_native_user(
        sidebar
    ) {

        /*
         * نحذف أي Footer قديم أنشأناه
         * في النسخ السابقة.
         */
        sidebar
            .querySelectorAll(
                ".archive-sidebar-user-footer"
            )
            .forEach(
                (element) =>
                    element.remove()
            );


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


        const lines =
            button
                .querySelectorAll(
                    ".avatar-name-email > span"
                );


        if (
            lines.length
            >= 2
        ) {

            lines[
                lines.length - 1
            ].textContent =
                get_role_label();
        }


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


            arrow.innerHTML =
                get_icon_html(
                    "chevron-down",
                    "xs"
                )
                ||
                "⌄";


            button.appendChild(
                arrow
            );
        }
    }


    /* =========================================================
       TOGGLE
       ========================================================= */

    function sync_toggle(
        button
    ) {

        if (!button) {
            return;
        }


        const compact =
            state.mode
            === "compact";


        const placement =
            state.environment
                .placement;


        /*
         * السهم يشير إلى اتجاه الحركة
         * بغض النظر عن RTL/LTR.
         */
        let icon_name;


        if (
            placement
            === "left"
        ) {

            icon_name =
                compact
                    ? "chevron-right"
                    : "chevron-left";

        } else {

            icon_name =
                compact
                    ? "chevron-left"
                    : "chevron-right";
        }


        const label =
            compact
                ? "توسيع الشريط الجانبي"
                : "طي الشريط الجانبي";


        button.innerHTML =
            get_icon_html(
                icon_name,
                "sm"
            )
            ||
            (
                compact
                    ? "›"
                    : "‹"
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
            compact
                ? "false"
                : "true"
        );
    }


    function toggle_mode() {

        const viewport =
            state.environment
                .viewport;


        if (
            viewport
            === "mobile"
        ) {
            return;
        }


        if (
            viewport
            === "tablet"
        ) {

            state.tablet_expanded =
                !state.tablet_expanded;


            schedule_render();

            return;
        }


        const next =
            state.mode
            === "compact"
                ? "expanded"
                : "compact";


        state.desktop_preference =
            next;


        save_desktop_preference(
            next
        );


        schedule_render();
    }

    function get_footer_anchor(
        sidebar
    ) {

        const user_button =
            sidebar.querySelector(
                ".sidebar-user-button"
            );


        if (!user_button) {
            return null;
        }


        /*
        * لا نعتمد على اسم Class للفوتر.
        *
        * نصعد من زر المستخدم حتى نجد
        * أول عنصر ابن مباشر للـSidebar.
        *
        * بهذه الطريقة لو تغيّر اسم Wrapper
        * في Frappe مستقبلًا لا ينكسر الكود.
        */
        let node =
            user_button;


        while (
            node
            &&
            node.parentElement
            &&
            node.parentElement
                !== sidebar
        ) {

            node =
                node.parentElement;
        }


        if (
            !node
            ||
            node.parentElement
                !== sidebar
        ) {

            /*
            * Fallback محافظ.
            */
            return (
                user_button
                    .closest(
                        ".dropdown-navbar-user"
                    )
                ||
                user_button
                    .parentElement
                ||
                null
            );
        }


        node.classList.add(
            "archive-sidebar-footer-anchor"
        );


        return node;
    }


    // function decorate_toggle(
    //     sidebar
    // ) {

    //     const footer =
    //         sidebar.querySelector(
    //             ".body-sidebar-bottom"
    //         );


    //     if (!footer) {
    //         return;
    //     }


    //     let button =
    //         footer.querySelector(
    //             ".archive-sidebar-toggle"
    //         );


    //     if (!button) {

    //         button =
    //             document.createElement(
    //                 "button"
    //             );


    //         button.type =
    //             "button";


    //         button.className =
    //             "archive-sidebar-toggle";


    //         button.addEventListener(
    //             "click",
    //             (event) => {

    //                 event.preventDefault();

    //                 event.stopPropagation();


    //                 toggle_mode();
    //             }
    //         );


    //         footer.appendChild(
    //             button
    //         );
    //     }


    //     sync_toggle(
    //         button
    //     );
    // }

    function decorate_toggle(
        sidebar
    ) {

        const footer =
            get_footer_anchor(
                sidebar
            );


        if (!footer) {
            return;
        }


        /*
        * إذا بقي زر قديم من Render سابق
        * في مكان آخر، نحذفه.
        */
        sidebar
            .querySelectorAll(
                ".archive-sidebar-toggle"
            )
            .forEach(
                (existing_button) => {

                    if (
                        !footer.contains(
                            existing_button
                        )
                    ) {

                        existing_button
                            .remove();
                    }
                }
            );


        let button =
            footer.querySelector(
                ":scope > .archive-sidebar-toggle"
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

                    event.preventDefault();

                    event.stopPropagation();


                    toggle_mode();
                }
            );


            footer.appendChild(
                button
            );
        }


        sync_toggle(
            button
        );
    }




    /* =========================================================
       APPLY STATE
       ========================================================= */

    function apply_environment_attributes() {

        const sidebar =
            state.sidebar;


        if (!sidebar) {
            return;
        }


        sidebar.dataset
            .archiveDirection =
                state.environment
                    .direction;


        sidebar.dataset
            .archivePlacement =
                state.environment
                    .placement;


        sidebar.dataset
            .archiveViewport =
                state.environment
                    .viewport;


        sidebar.dataset
            .archiveMode =
                state.mode;
    }


    function apply_mode() {

        const container =
            state.container;


        if (!container) {
            return;
        }


        container.classList
            .remove(
                "archive-sidebar-expanded",
                "archive-sidebar-compact",
                "archive-sidebar-mobile"
            );


        if (
            state.mode
            === "mobile"
        ) {

            container.classList
                .add(
                    "archive-sidebar-mobile"
                );


            release_to_native_mobile();

            return;
        }


        /*
         * Desktop / Tablet:
         * Frappe يبقى Expanded تقنيًا.
         */
        ensure_native_sidebar_open();


        if (
            state.mode
            === "compact"
        ) {

            container.classList
                .add(
                    "archive-sidebar-compact"
                );

        } else {

            container.classList
                .add(
                    "archive-sidebar-expanded"
                );
        }
    }


    /* =========================================================
       RENDER
       ========================================================= */

    function render() {

        const sidebar =
            get_sidebar();


        if (!sidebar) {
            return;
        }


        const container =
            get_container(
                sidebar
            );


        if (!container) {
            return;
        }


        const sidebar_changed =
            state.sidebar
            !== sidebar;


        state.sidebar =
            sidebar;


        state.container =
            container;


        state.environment =
            read_environment();


        state.mode =
            derive_mode();


        sidebar.classList
            .add(
                "archive-sidebar-v3"
            );


        apply_environment_attributes();


        apply_mode();


        hide_utility_items(
            sidebar
        );


        decorate_sections(
            sidebar
        );


        decorate_links(
            sidebar
        );


        decorate_native_user(
            sidebar
        );


        decorate_toggle(
            sidebar
        );


        if (
            sidebar_changed
        ) {

            attach_local_observers();
        }


        state.mounted =
            true;
    }


    function schedule_render() {

        if (
            state.render_scheduled
        ) {
            return;
        }


        state.render_scheduled =
            true;


        requestAnimationFrame(
            () => {

                state.render_scheduled =
                    false;


                render();
            }
        );
    }


    /* =========================================================
       OBSERVERS
       ========================================================= */

    function attach_local_observers() {

        state.sidebar_observer
            ?.disconnect();


        state.resize_observer
            ?.disconnect();


        if (
            state.container
        ) {

            state.sidebar_observer =
                new MutationObserver(
                    () => {

                        schedule_render();
                    }
                );


            state.sidebar_observer
                .observe(
                    state.container,
                    {
                        childList:
                            true,

                        subtree:
                            true,
                    }
                );
        }


        if (
            typeof ResizeObserver
            !== "undefined"
            &&
            state.sidebar
        ) {

            state.resize_observer =
                new ResizeObserver(
                    () => {

                        const placement =
                            detect_sidebar_placement(
                                state.sidebar
                            );


                        if (
                            placement
                            !==
                            state.environment
                                .placement
                        ) {

                            state.environment
                                .placement =
                                    placement;


                            apply_environment_attributes();


                            sync_toggle(
                                state.sidebar
                                    .querySelector(
                                        ".archive-sidebar-toggle"
                                    )
                            );
                        }
                    }
                );


            state.resize_observer
                .observe(
                    state.sidebar
                );
        }
    }


    function attach_document_observer() {

        if (
            state.document_observer
        ) {
            return;
        }


        state.document_observer =
            new MutationObserver(
                () => {

                    schedule_render();
                }
            );


        state.document_observer
            .observe(
                document.documentElement,
                {
                    attributes:
                        true,

                    attributeFilter: [
                        "dir",
                        "lang",
                    ],
                }
            );
    }


    function attach_window_events() {

        window.addEventListener(
            "resize",
            schedule_render,
            {
                passive:
                    true,
            }
        );


        window.addEventListener(
            "orientationchange",
            schedule_render,
            {
                passive:
                    true,
            }
        );
    }


    /* =========================================================
       BOOTSTRAP
       ========================================================= */

    function bootstrap() {

        state.desktop_preference =
            read_desktop_preference();


        attach_document_observer();


        attach_window_events();


        const sidebar =
            get_sidebar();


        if (sidebar) {

            schedule_render();

            return;
        }


        /*
         * Observer مؤقت فقط حتى ينشأ Sidebar.
         * بعدها يتم فصله.
         */
        state.bootstrap_observer =
            new MutationObserver(
                () => {

                    if (
                        !get_sidebar()
                    ) {
                        return;
                    }


                    state.bootstrap_observer
                        ?.disconnect();


                    state.bootstrap_observer =
                        null;


                    schedule_render();
                }
            );


        state.bootstrap_observer
            .observe(
                document.body,
                {
                    childList:
                        true,

                    subtree:
                        true,
                }
            );
    }


    if (
        document.readyState
        === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            bootstrap,
            {
                once:
                    true,
            }
        );

    } else {

        bootstrap();
    }

})();