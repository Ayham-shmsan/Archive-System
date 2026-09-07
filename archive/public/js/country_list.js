frappe.listview_settings["Country"]={
    hide_name_column: true,

    formatters:{
        country_name(value){
            return __(value || "");
        },
    },
};