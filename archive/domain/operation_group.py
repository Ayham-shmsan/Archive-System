import frappe

from frappe import _
from frappe.utils import cint, cstr


def get_operation_group_by_number(
    operation_no_normalized,
):
    """
    إيجاد المجموعة المرتبطة برقم العملية الموحد.

    لا نتعامل مع operation_no الخام هنا؛
    المصدر الحقيقي للمقارنة هو الرقم الموحد.
    """

    normalized = cstr(
        operation_no_normalized
    ).strip()

    if not normalized:
        return None

    return frappe.db.get_value(
        "Archive Operation Group",
        {
            "operation_no_normalized":
                normalized,
        },
        "name",
    )


def get_group_normalized_number(
    group_name,
):
    if not group_name:
        return None

    return frappe.db.get_value(
        "Archive Operation Group",
        group_name,
        "operation_no_normalized",
    )


def create_operation_group(
    *,
    operation_no=None,
    operation_no_normalized=None,
):
    """
    إنشاء المجموعة فقط.

    لا تحتوي هذه الدالة على قرار:
    هل المجموعة موجودة أم لا؟

    القرار موجود في ensure_operation_group().
    """

    group = frappe.new_doc(
        "Archive Operation Group"
    )

    group.operation_no = (
        cstr(operation_no).strip()
        or None
    )

    group.operation_no_normalized = (
        cstr(
            operation_no_normalized
        ).strip()
        or None
    )

    group.insert(
        ignore_permissions=True
    )

    return group.name


def ensure_numbered_operation_group(
    operation,
    normalized,
):
    """
    ربط عملية ذات رقم بمجموعة ذلك الرقم.

    invariant:
        لكل operation_no_normalized
        مجموعة واحدة فقط.
    """

    current_group = cstr(
        operation.operation_group
    ).strip()

    # --------------------------------------------------------
    # العملية مرتبطة بالفعل بالمجموعة الصحيحة.
    # --------------------------------------------------------

    if current_group:
        current_normalized = cstr(
            get_group_normalized_number(
                current_group
            )
        ).strip()

        if (
            current_normalized
            == normalized
        ):
            return current_group

    # --------------------------------------------------------
    # ربما المجموعة موجودة من جزء سابق.
    # --------------------------------------------------------

    group_name = (
        get_operation_group_by_number(
            normalized
        )
    )

    if group_name:
        operation.operation_group = (
            group_name
        )

        return group_name

    # --------------------------------------------------------
    # أول جزء لهذا الرقم.
    #
    # يوجد Unique Constraint على
    # operation_no_normalized.
    #
    # لذلك نعالج كذلك حالة طلبين متزامنين.
    # --------------------------------------------------------

    try:
        group_name = (
            create_operation_group(
                operation_no=
                    operation.operation_no,

                operation_no_normalized=
                    normalized,
            )
        )

    except frappe.DuplicateEntryError:
        group_name = (
            get_operation_group_by_number(
                normalized
            )
        )

        if not group_name:
            raise

    operation.operation_group = (
        group_name
    )

    return group_name


def ensure_blocked_operation_group(
    operation,
):
    """
    العملية المحضورة لا تملك رقم عملية.

    لذلك لا يمكن تجميعها برقم.
    كل عملية محضورة تحصل على مجموعة مستقلة.
    """

    current_group = cstr(
        operation.operation_group
    ).strip()

    if (
        current_group
        and
        frappe.db.exists(
            "Archive Operation Group",
            current_group,
        )
    ):
        return current_group

    group_name = (
        create_operation_group()
    )

    operation.operation_group = (
        group_name
    )

    return group_name


def ensure_operation_group(
    operation,
):
    """
    نقطة الدخول الوحيدة لتحديد مجموعة العملية.

    القواعد:

    1. كل Archive Operation لها Group.
    2. كل العمليات التي تحمل نفس الرقم الموحد
       تنتمي إلى نفس Group.
    3. العملية المحضورة بدون رقم تحصل
       على Group مستقلة.
    """

    blocked = bool(
        cint(
            operation.is_blocked_operation
        )
    )

    normalized = cstr(
        operation.operation_no_normalized
    ).strip()

    if blocked:
        return (
            ensure_blocked_operation_group(
                operation
            )
        )

    if not normalized:
        frappe.throw(
            _(
                "تعذر تحديد مجموعة العملية "
                "لأن رقم العملية الموحد غير موجود."
            )
        )

    return (
        ensure_numbered_operation_group(
            operation,
            normalized,
        )
    )