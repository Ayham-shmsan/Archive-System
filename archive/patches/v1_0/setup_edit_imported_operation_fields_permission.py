import frappe
from archive.services.operation_permissions import (
    EDIT_IMPORTED_OPERATION_FIELDS_PERMISSION,
    ROLE_EDIT_IMPORTED_OPERATION_FIELDS,
)


def execute():
    if not frappe.db.exists("Role", ROLE_EDIT_IMPORTED_OPERATION_FIELDS):
        role_doc = frappe.new_doc("Role")
        role_doc.role_name = ROLE_EDIT_IMPORTED_OPERATION_FIELDS
        role_doc.desk_access = 1
        role_doc.disabled = 0
        role_doc.insert(ignore_permissions=True)
    else:
        frappe.db.set_value(
            "Role",
            ROLE_EDIT_IMPORTED_OPERATION_FIELDS,
            {"desk_access": 1, "disabled": 0},
            update_modified=False,
        )

    perm_type_name = "archive_operation_edit_imported_operation_fields"
    if not frappe.db.exists("Permission Type", perm_type_name):
        pt_doc = frappe.get_doc(
            {
                "doctype": "Permission Type",
                "name": perm_type_name,
                "doc_type": "Archive Operation",
                "module": "Archive",
                "perm_type": EDIT_IMPORTED_OPERATION_FIELDS_PERMISSION,
            }
        )
        pt_doc.insert(ignore_permissions=True)

    # Ensure Custom DocPerm entries (if Custom DocPerm overrides exist for Archive Operation)
    # also grant edit_imported_operation_fields to System Manager and ROLE_EDIT_IMPORTED_OPERATION_FIELDS.
    if frappe.db.has_column("Custom DocPerm", EDIT_IMPORTED_OPERATION_FIELDS_PERMISSION):
        frappe.db.sql(
            f"""
            UPDATE `tabCustom DocPerm`
            SET `{EDIT_IMPORTED_OPERATION_FIELDS_PERMISSION}` = 1
            WHERE parent = 'Archive Operation'
              AND role IN ('System Manager', %s)
              AND permlevel = 0
            """,
            (ROLE_EDIT_IMPORTED_OPERATION_FIELDS,),
        )

    frappe.clear_cache(doctype="Archive Operation")
    frappe.clear_cache(doctype="User")
