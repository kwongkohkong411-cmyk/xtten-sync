import { Button, Menu } from "antd";
import React, { useState, useEffect } from "react";
import {
  DownloadOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../utils/auth";
import { getVisibleMenuSections } from "../../navigation/appShellConfig";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const currentUser = getCurrentUser();
  const companyName = currentUser?.company?.name || "XTTEN";
  const companyLogo = currentUser?.company?.logo || "";

  const visibleSections = getVisibleMenuSections(currentUser);
  const visibleItems = visibleSections.map((section) => {
    if (section.route) {
      return {
        key: section.route.path,
        icon: section.icon,
        label: section.label,
      };
    }

    return {
      key: section.key,
      icon: section.icon,
      label: section.label,
      children: section.children.map((child) => ({
        key: child.path,
        label: child.label,
      })),
    };
  });

  // derive selected and open keys
  const pathname = location.pathname;
  const allKeys = visibleItems.flatMap((it) => (it.children && it.children.length ? it.children.map((c: any) => c.key) : [it.key]));
  const exactMatch = allKeys.find((k) => typeof k === 'string' && pathname === k) as string | undefined;
  const prefixMatch = allKeys.find((k) => {
    if (typeof k !== 'string') return false;
    if (k.includes('/:')) {
      const base = k.split('/:')[0];
      return pathname.startsWith(base);
    }
    return pathname.startsWith(k + '/');
  }) as string | undefined;
  const selectedKey = exactMatch || prefixMatch;

  const derivedOpenKeys = visibleItems
    .filter((it) => it.children && it.children.length && it.children.some((c: any) => c.key === selectedKey))
    .map((it) => it.key as string);

  useEffect(() => {
    if (derivedOpenKeys.length > 0) {
      setOpenKeys((prev) => Array.from(new Set([...prev, ...derivedOpenKeys])));
    }
  }, [pathname, selectedKey]);

  function handleMenuClick(key: string) {
    if (key === "/logout") {
      localStorage.removeItem("xtten_token");
      localStorage.removeItem("xtten_user");
      localStorage.removeItem("employee_id");
      localStorage.removeItem("company_id");
      navigate("/");
      return;
    }

    navigate(key);
  }

  return (
    <div
      className="xtten-sidebar"
      style={{
        width: 300,
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        background: "linear-gradient(180deg,#1E0038,#12001F,#070012)",
        padding: 16,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {companyLogo ? (
          <img
            src={companyLogo}
            alt="company-logo"
            style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
          />
        ) : (
          <img
            src="/favicon.svg"
            alt="xtten-logo"
            style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>XTTEN</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {companyName}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 12 }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          onClick={({ key }) => handleMenuClick(String(key))}
          items={visibleItems}
          style={{ background: "transparent", border: "none" }}
        />
      </div>

      {/* APP DOWNLOAD - fixed left bottom */}
      {currentUser && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 12,
            paddingBottom: 4,
          }}
        >
          <Button
            block
            icon={<DownloadOutlined />}
            onClick={() => navigate("/agent/download")}
            style={{
              height: 40,
              borderRadius: 10,
              background: "rgba(255,255,255,0.08)",
              color: "#F8FAFF",
              borderColor: "rgba(255,255,255,0.18)",
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            App Download
          </Button>
        </div>
      )}
    </div>
  );
}