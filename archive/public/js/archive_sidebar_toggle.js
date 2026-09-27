(() => {
    "use strict";

    const STORAGE_KEY =
        "archive.workspace_sidebar.full_hidden.v1";

    const HIDDEN_CLASS =
        "archive-workspace-sidebar-hidden";

    const TOGGLE_ID =
        "archive-workspace-sidebar-toggle";

    const DESKTOP_MIN_WIDTH =
        768;


    let current_container =
        null;

    let current_sidebar =
        null;

    let toggle_button =
        null;

    let last_physical_side =
        "left";

    let resize_observer =
        null;

    let scheduled_frame =
        null;


    /* ============================================================
       Sidebar discovery
       لا نعتمد على الاسم أو اللغة أو الاتجاه
       ============================================================ */

    function get_sidebar_pairs() {
        const containers = [
            ...document.querySelectorAll(
                ".body-sidebar-container"
            ),
        ];

        return containers
            .map((container) => {
                let sidebar = null;

                try {
                    sidebar =
                        container.querySelector(
                            ":scope > .body-sidebar"
                        );
                } catch (error) {
                    sidebar =
                        container.querySelector(
                            ".body-sidebar"
                        );
                }

                if (!sidebar) {
                    return null;
                }

                return {
                    container,
                    sidebar,
                };
            })
            .filter(Boolean);
    }


    function is_element_visible(
        element
    ) {
        if (
            !element
            ||
            !element.isConnected
        ) {
            return false;
        }

        const style =
            window.getComputedStyle(
                element
            );

        if (
            style.display
                === "none"
            ||
            style.visibility
                === "hidden"
        ) {
            return false;
        }

        const rect =
            element
                .getBoundingClientRect();

        return (
            rect.height > 0
            &&
            rect.bottom > 0
            &&
            rect.top
                <
            window.innerHeight
        );
    }


    function find_active_pair() {
        const pairs =
            get_sidebar_pairs();

        if (!pairs.length) {
            return null;
        }

        /*
         * الأولوية للـSidebar الظاهر فعليًا.
         *
         * إذا كان هناك أكثر من واحد،
         * نأخذ صاحب أكبر مساحة مرئية.
         */
        const visible_pairs =
            pairs
                .filter(
                    ({ sidebar }) =>
                        is_element_visible(
                            sidebar
                        )
                )
                .sort(
                    (a, b) => {
                        const a_rect =
                            a.sidebar
                                .getBoundingClientRect();

                        const b_rect =
                            b.sidebar
                                .getBoundingClientRect();

                        return (
                            (
                                b_rect.width
                                *
                                b_rect.height
                            )
                            -
                            (
                                a_rect.width
                                *
                                a_rect.height
                            )
                        );
                    }
                );

        if (
            visible_pairs.length
        ) {
            return visible_pairs[0];
        }

        /*
         * عندما نكون نحن من أخفى الـSidebar،
         * سيصبح sidebar غير مرئي.
         *
         * لذلك نبحث عن Container يحمل كلاسنا.
         */
        const hidden_pair =
            pairs.find(
                ({ container }) =>
                    container
                        .classList
                        .contains(
                            HIDDEN_CLASS
                        )
            );

        if (hidden_pair) {
            return hidden_pair;
        }

        /*
         * Fallback أخير.
         */
        return pairs[0];
    }


    /* ============================================================
       Physical side detection
       المهم موقع العنصر الحقيقي، وليس RTL/LTR
       ============================================================ */

    function detect_physical_side(
        sidebar
    ) {
        if (
            !sidebar
            ||
            !sidebar.isConnected
        ) {
            return last_physical_side;
        }

        const rect =
            sidebar
                .getBoundingClientRect();

        if (
            rect.width <= 0
        ) {
            return last_physical_side;
        }

        const distance_from_left =
            Math.abs(
                rect.left
            );

        const distance_from_right =
            Math.abs(
                window.innerWidth
                -
                rect.right
            );

        last_physical_side =
            (
                distance_from_left
                <=
                distance_from_right
            )
                ? "left"
                : "right";

        return last_physical_side;
    }


    /* ============================================================
       State
       ============================================================ */

    function get_saved_hidden() {
        return (
            window.localStorage
                .getItem(
                    STORAGE_KEY
                )
            === "1"
        );
    }


    function save_hidden(
        hidden
    ) {
        window.localStorage
            .setItem(
                STORAGE_KEY,
                hidden
                    ? "1"
                    : "0"
            );
    }


    /* ============================================================
       Toggle button
       ============================================================ */

    function create_toggle_button() {
        let button =
            document.getElementById(
                TOGGLE_ID
            );

        if (button) {
            return button;
        }

        button =
            document.createElement(
                "button"
            );

        button.id =
            TOGGLE_ID;

        button.type =
            "button";

        button.className =
            "archive-workspace-sidebar-toggle";

        button.setAttribute(
            "aria-label",
            "إخفاء القائمة الجانبية"
        );

        button.setAttribute(
            "title",
            "إخفاء القائمة الجانبية"
        );

        document.body.appendChild(
            button
        );

        button.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                synchronize_pair();

                if (
                    !current_container
                ) {
                    return;
                }

                const is_hidden =
                    current_container
                        .classList
                        .contains(
                            HIDDEN_CLASS
                        );

                set_hidden(
                    !is_hidden
                );
            }
        );

        return button;
    }


    function update_button_state(
        hidden
    ) {
        if (!toggle_button) {
            return;
        }

        toggle_button.dataset.hidden =
            hidden
                ? "1"
                : "0";

        toggle_button.dataset.side =
            last_physical_side;

        toggle_button.setAttribute(
            "aria-expanded",
            hidden
                ? "false"
                : "true"
        );

        toggle_button.setAttribute(
            "aria-label",
            hidden
                ? "إظهار القائمة الجانبية"
                : "إخفاء القائمة الجانبية"
        );

        toggle_button.setAttribute(
            "title",
            hidden
                ? "إظهار القائمة الجانبية"
                : "إخفاء القائمة الجانبية"
        );
    }


    /* ============================================================
       Hide / Show
       ============================================================ */

    function set_hidden(
        hidden,
        {
            persist = true,
        } = {}
    ) {
        synchronize_pair();

        if (
            !current_container
            ||
            !current_sidebar
        ) {
            return;
        }

        /*
         * قبل الإخفاء نحدد الجهة الحقيقية.
         */
        if (!hidden) {
            /*
             * عند الإظهار نعيده كاملًا.
             */
            current_container
                .classList
                .add(
                    "expanded"
                );

        } else {
            detect_physical_side(
                current_sidebar
            );
        }

        current_container
            .classList
            .toggle(
                HIDDEN_CLASS,
                hidden
            );

        update_button_state(
            hidden
        );

        schedule_position();

        if (persist) {
            save_hidden(
                hidden
            );
        }
    }


    /* ============================================================
       Handle positioning
       ============================================================ */

    function position_toggle() {
        scheduled_frame =
            null;

        if (!toggle_button) {
            return;
        }

        if (
            window.innerWidth
            <
            DESKTOP_MIN_WIDTH
        ) {
            toggle_button.style.display =
                "none";

            return;
        }

        synchronize_pair({
            reposition:
                false,
        });

        if (
            !current_container
            ||
            !current_sidebar
        ) {
            toggle_button.style.display =
                "none";

            return;
        }

        toggle_button.style.display =
            "block";

        const hidden =
            current_container
                .classList
                .contains(
                    HIDDEN_CLASS
                );

        toggle_button.style.left =
            "";

        toggle_button.style.right =
            "";


        if (hidden) {
            /*
             * Sidebar مخفي:
             * المقبض يلتصق بحافة الشاشة نفسها.
             */
            toggle_button.dataset.side =
                last_physical_side;

            if (
                last_physical_side
                === "left"
            ) {
                toggle_button.style.left =
                    "0px";

                toggle_button.style.right =
                    "auto";

            } else {
                toggle_button.style.right =
                    "0px";

                toggle_button.style.left =
                    "auto";
            }

            return;
        }


        /*
         * Sidebar ظاهر:
         * نقيس مكانه الحقيقي.
         */
        const side =
            detect_physical_side(
                current_sidebar
            );

        toggle_button.dataset.side =
            side;

        const rect =
            current_sidebar
                .getBoundingClientRect();

        /*
         * المقبض نصفه داخل الشريط
         * ونصفه باتجاه مساحة المحتوى.
         *
         * لا يوجد هنا أي 220px ثابت.
         */
        if (
            side === "left"
        ) {
            const x =
                Math.max(
                    0,
                    Math.min(
                        window.innerWidth
                        -
                        8,

                        rect.right
                        -
                        4
                    )
                );

            toggle_button.style.left =
                `${Math.round(x)}px`;

            toggle_button.style.right =
                "auto";

        } else {
            const distance =
                Math.max(
                    0,
                    window.innerWidth
                    -
                    rect.left
                    -
                    4
                );

            toggle_button.style.right =
                `${Math.round(
                    distance
                )}px`;

            toggle_button.style.left =
                "auto";
        }
    }


    function schedule_position() {
        if (scheduled_frame) {
            return;
        }

        scheduled_frame =
            window.requestAnimationFrame(
                position_toggle
            );
    }


    /* ============================================================
       Resize observation
       ============================================================ */

    function bind_resize_observer() {
        resize_observer
            ?.disconnect();

        resize_observer =
            null;

        if (
            !window.ResizeObserver
            ||
            !current_container
        ) {
            return;
        }

        resize_observer =
            new ResizeObserver(
                () => {
                    schedule_position();
                }
            );

        resize_observer.observe(
            current_container
        );

        if (
            current_sidebar
        ) {
            resize_observer.observe(
                current_sidebar
            );
        }
    }


    /* ============================================================
       Rebind after Frappe navigation
       ============================================================ */

    function synchronize_pair({
        reposition = true,
    } = {}) {
        const next =
            find_active_pair();

        if (!next) {
            current_container =
                null;

            current_sidebar =
                null;

            if (toggle_button) {
                toggle_button.style.display =
                    "none";
            }

            return false;
        }

        const changed =
            (
                next.container
                !== current_container
            )
            ||
            (
                next.sidebar
                !== current_sidebar
            );

        current_container =
            next.container;

        current_sidebar =
            next.sidebar;


        if (changed) {
            /*
             * نحسب الجهة قبل تطبيق الإخفاء.
             */
            if (
                !current_container
                    .classList
                    .contains(
                        HIDDEN_CLASS
                    )
            ) {
                detect_physical_side(
                    current_sidebar
                );
            }

            bind_resize_observer();

            /*
             * عند انتقال Frappe لصفحة جديدة،
             * نطبق الحالة المحفوظة على الـSidebar الجديد.
             */
            const should_be_hidden =
                get_saved_hidden();

            current_container
                .classList
                .toggle(
                    HIDDEN_CLASS,
                    should_be_hidden
                );

            if (
                !should_be_hidden
            ) {
                current_container
                    .classList
                    .add(
                        "expanded"
                    );
            }

            update_button_state(
                should_be_hidden
            );
        }


        if (reposition) {
            schedule_position();
        }

        return true;
    }


    /* ============================================================
       Boot
       ============================================================ */

    function boot() {
        toggle_button =
            create_toggle_button();

        /*
         * أول اكتشاف.
         */
        synchronize_pair();

        if (
            current_container
            &&
            current_sidebar
        ) {
            const should_be_hidden =
                get_saved_hidden();

            /*
             * نحسب الجهة قبل الإخفاء.
             */
            detect_physical_side(
                current_sidebar
            );

            set_hidden(
                should_be_hidden,
                {
                    persist:
                        false,
                }
            );
        }


        /*
         * Frappe يغير DOM أثناء التنقل بين Workspaces/Pages.
         */
        const mutation_observer =
            new MutationObserver(
                () => {
                    schedule_position();
                    synchronize_pair();
                }
            );

        mutation_observer.observe(
            document.body,
            {
                childList:
                    true,

                subtree:
                    true,
            }
        );


        /*
         * Browser resize / direction / zoom related layout.
         */
        window.addEventListener(
            "resize",
            schedule_position,
            {
                passive:
                    true,
            }
        );


        /*
         * Mobile browser / zoom viewport.
         */
        if (
            window.visualViewport
        ) {
            window.visualViewport
                .addEventListener(
                    "resize",
                    schedule_position,
                    {
                        passive:
                            true,
                    }
                );

            window.visualViewport
                .addEventListener(
                    "scroll",
                    schedule_position,
                    {
                        passive:
                            true,
                    }
                );
        }


        /*
         * عندما يعود المستخدم للتاب،
         * نعيد القياس لأن Layout قد يكون تغير.
         */
        document.addEventListener(
            "visibilitychange",
            () => {
                if (
                    !document.hidden
                ) {
                    synchronize_pair();
                }
            }
        );
    }


    if (
        document.readyState
        === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    } else {
        boot();
    }
})();