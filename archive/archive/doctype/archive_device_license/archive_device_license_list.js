frappe.listview_settings[
    "Archive Device License"
] = {

    add_fields: [
        "status",
        "device_name",
        "last_mac",
        "last_observed_ip",
        "last_seen",
    ],


    get_indicator(
        doc
    ) {

        const indicators = {

            Pending: [
                "بانتظار التفعيل",
                "orange",
                "status,=,Pending",
            ],

            Active: [
                "فعال",
                "green",
                "status,=,Active",
            ],

            Suspended: [
                "معلق",
                "yellow",
                "status,=,Suspended",
            ],

            Mismatch: [
                "تغيرت هوية الجهاز",
                "red",
                "status,=,Mismatch",
            ],

            Revoked: [
                "ملغي",
                "gray",
                "status,=,Revoked",
            ],
        };


        return (
            indicators[
                doc.status
            ]
            ||
            [
                doc.status,
                "gray",
                `status,=,${doc.status}`,
            ]
        );
    },
};