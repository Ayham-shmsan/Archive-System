frappe.ui.form.on(
    "Archive Device License",
    {

        refresh(
            frm
        ) {

            if (
                frm.is_new()
            ) {
                return;
            }


            if (
                frm.doc.status
                === "Pending"
            ) {

                frm.add_custom_button(
                    "تفعيل الجهاز",
                    () => {

                        activate_license(
                            frm
                        );
                    }
                );
            }


            if (
                frm.doc.status
                === "Active"
            ) {

                frm.add_custom_button(
                    "تعليق الترخيص",
                    () => {

                        suspend_license(
                            frm
                        );
                    }
                );


                frm.add_custom_button(
                    "إلغاء الترخيص",
                    () => {

                        revoke_license(
                            frm
                        );
                    }
                );
            }


            if (
                frm.doc.status
                === "Suspended"
            ) {

                frm.add_custom_button(
                    "استئناف الترخيص",
                    () => {

                        resume_license(
                            frm
                        );
                    }
                );


                frm.add_custom_button(
                    "إلغاء الترخيص",
                    () => {

                        revoke_license(
                            frm
                        );
                    }
                );
            }
            if (
                frm.doc.status
                    === "Mismatch"
            ) {

                frm.add_custom_button(
                    "اعتماد التغيير وإعادة التفعيل",
                    () => {

                        rebind_license(
                            frm
                        );
                    }
                );
            }
        },

    }
);


async function activate_license(
    frm
) {

    const confirmed =
        await new Promise(
            (
                resolve
            ) => {

                frappe.confirm(
                    `
                        سيتم ربط الترخيص الحالي بـ:
                        <br><br>
                        <b>MAC:</b>
                        ${frappe.utils.escape_html(
                            frm.doc.last_mac
                            || "—"
                        )}
                        <br>
                        <b>IP:</b>
                        ${frappe.utils.escape_html(
                            frm.doc.last_observed_ip
                            || "—"
                        )}
                        <br><br>
                        هل تريد تفعيل الجهاز؟
                    `,

                    () =>
                        resolve(
                            true
                        ),

                    () =>
                        resolve(
                            false
                        )
                );
            }
        );


    if (!confirmed) {
        return;
    }


    await frappe.call({
        method:
            "archive.api.device_license.activate_device_license",

        type:
            "POST",

        args: {
            activation_code:
                frm.doc
                    .activation_code,
        },

        freeze:
            true,

        freeze_message:
            "جارٍ تفعيل الجهاز...",
    });


    await frm.reload_doc();
}


function suspend_license(
    frm
) {

    frappe.prompt(
        [
            {
                fieldname:
                    "reason",

                fieldtype:
                    "Small Text",

                label:
                    "سبب التعليق",

                reqd:
                    1,
            },
        ],

        async (
            values
        ) => {

            await frappe.call({
                method:
                    "archive.api.device_license.suspend_device_license",

                type:
                    "POST",

                args: {
                    activation_code:
                        frm.doc
                            .activation_code,

                    reason:
                        values.reason,
                },

                freeze:
                    true,
            });


            await frm.reload_doc();
        },

        "تعليق الترخيص",

        "تعليق"
    );
}


async function resume_license(
    frm
) {

    await frappe.call({
        method:
            "archive.api.device_license.resume_device_license",

        type:
            "POST",

        args: {
            activation_code:
                frm.doc
                    .activation_code,
        },

        freeze:
            true,
    });


    await frm.reload_doc();
}


function revoke_license(
    frm
) {

    frappe.confirm(
        `
            هل تريد إلغاء هذا الترخيص نهائيًا؟
            <br><br>
            لن يستطيع الجهاز الدخول
            بعد إلغاء الترخيص.
        `,

        async () => {

            await frappe.call({
                method:
                    "archive.api.device_license.revoke_device_license",

                type:
                    "POST",

                args: {
                    activation_code:
                        frm.doc
                            .activation_code,
                },

                freeze:
                    true,
            });


            await frm.reload_doc();
        }
    );
}

function rebind_license(
    frm
) {

    frappe.confirm(
        `
            سيتم اعتماد هوية الجهاز الحالية
            وربط الترخيص بها.
            <br><br>

            <b>MAC السابق:</b>
            ${frappe.utils.escape_html(
                frm.doc.licensed_mac
                || "—"
            )}

            <br>

            <b>MAC الحالي:</b>
            ${frappe.utils.escape_html(
                frm.doc.last_mac
                || "—"
            )}

            <br><br>

            <b>IP السابق:</b>
            ${frappe.utils.escape_html(
                frm.doc.licensed_ip
                || "—"
            )}

            <br>

            <b>IP الحالي:</b>
            ${frappe.utils.escape_html(
                frm.doc.last_reported_ip
                || "—"
            )}

            <br><br>

            هل تريد اعتماد التغيير؟
        `,

        async () => {

            await frappe.call({
                method:
                    "archive.api.device_license.rebind_device_license",

                type:
                    "POST",

                args: {
                    activation_code:
                        frm.doc
                            .activation_code,
                },

                freeze:
                    true,

                freeze_message:
                    "جارٍ إعادة ربط الجهاز...",
            });


            await frm.reload_doc();
        }
    );
}