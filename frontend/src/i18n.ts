
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      menu: {
        dashboard: "Dashboard",
        companies: "Companies",
        departments: "Departments",
        employees: "Employees",
        attendance: "Attendance",
        reports: "Reports",
        users: "Users",
        settings: "Settings",
      },

      common: {
        profile: "Profile",
        logout: "Logout",
        search: "Search...",
        edit: "Edit",
        delete: "Delete",
        create: "Create",
        update: "Update",
        cancel: "Cancel",
        save: "Save",
        active: "ACTIVE",
        disabled: "DISABLED",
      },

      page: {
        dashboardSubtitle: "Overview of your organization",
        employeesSubtitle: "Manage all employees",
        attendanceSubtitle: "Track attendance and working hours",
        reportsSubtitle: "View analytics and export reports",
        settingsSubtitle: "System configuration",
      },

      company: {
        title: "Companies",
        subtitle: "Manage your companies and organizations",
        new: "New Company",
        edit: "Edit Company",

        name: "Company Name",
        code: "Company Code",
        country: "Country",
        timezone: "Timezone",
        plan: "Plan",
        status: "Status",

        create: "Create",
        update: "Update",
        delete: "Delete",

        search: "Search company...",

        successCreate: "Company created successfully",
        successUpdate: "Company updated successfully",
        successDelete: "Company deleted successfully",
      },

      department: {
        title: "Departments",
        subtitle: "Manage departments under each company",
        new: "New Department",
        edit: "Edit Department",

        name: "Department Name",
        code: "Department Code",
        company: "Company",
        status: "Status",

        search: "Search department...",

        create: "Create",
        update: "Update",
        delete: "Delete",

        successCreate: "Department created successfully",
        successUpdate: "Department updated successfully",
        successDelete: "Department deleted successfully",
      },

      employee: {
        title: "Employees",
        subtitle: "Manage all employees",
        new: "New Employee",
      },
    },
  },

  zh: {
    translation: {
      menu: {
        dashboard: "仪表盘",
        companies: "公司管理",
        departments: "部门管理",
        employees: "员工管理",
        attendance: "考勤管理",
        reports: "报表中心",
        users: "用户管理",
        settings: "系统设置",
      },

      common: {
        profile: "个人资料",
        logout: "退出登录",
        search: "搜索...",
        edit: "编辑",
        delete: "删除",
        create: "创建",
        update: "更新",
        cancel: "取消",
        save: "保存",
        active: "启用",
        disabled: "停用",
      },

      page: {
        dashboardSubtitle: "查看组织整体情况",
        employeesSubtitle: "管理员工资料",
        attendanceSubtitle: "追踪考勤与工作时长",
        reportsSubtitle: "查看分析与导出报表",
        settingsSubtitle: "系统配置",
      },

      company: {
        title: "公司管理",
        subtitle: "管理所有公司",
        new: "新增公司",
        edit: "编辑公司",

        name: "公司名称",
        code: "公司代码",
        country: "国家",
        timezone: "时区",
        plan: "套餐",
        status: "状态",

        create: "创建",
        update: "更新",
        delete: "删除",

        search: "搜索公司...",

        successCreate: "公司创建成功",
        successUpdate: "公司更新成功",
        successDelete: "公司删除成功",
      },

      department: {
        title: "部门管理",
        subtitle: "管理公司所有部门",
        new: "新增部门",
        edit: "编辑部门",

        name: "部门名称",
        code: "部门代码",
        company: "所属公司",
        status: "状态",

        search: "搜索部门...",

        create: "创建",
        update: "更新",
        delete: "删除",

        successCreate: "部门创建成功",
        successUpdate: "部门更新成功",
        successDelete: "部门删除成功",
      },

      employee: {
        title: "员工管理",
        subtitle: "管理员工资料",
        new: "新增员工",
      },
    },
  },
};

const savedLanguage = localStorage.getItem("xtten_language") || "en";

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

