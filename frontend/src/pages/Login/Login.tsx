import { Button, Card, Form, Input, Space, Tag, Typography, message } from "antd";
import { LockOutlined, UserOutlined, CheckCircleOutlined, FileDoneOutlined, LogoutOutlined, TeamOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { login } from "../../api/auth";
import "./Login.css";

const { Title, Text, Paragraph } = Typography;

export default function Login() {
  const navigate = useNavigate();

  const onFinish = async (values: { account: string; password: string }) => {
    try {
      const res = await login(values.account, values.password);
      const data = res.data;

      console.log("LOGIN RESPONSE:", data);

      if (!data?.user || !data?.access_token) {
        message.error("Login failed: invalid response");
        return;
      }

      const user = data.user;

      localStorage.setItem("xtten_token", data.access_token);
      localStorage.setItem("xtten_user", JSON.stringify(user));

      if (user.companyId) {
        localStorage.setItem("company_id", user.companyId);
      }

      const employeeId = user.employeeId || user.id;

      if (employeeId) {
        localStorage.setItem("employee_id", employeeId);
      }

      message.success("Login successful");

      setTimeout(() => {
        navigate("/dashboard");
      }, 300);

    } catch (err: any) {
      console.error("LOGIN ERROR:", err);

      message.error(
        err?.response?.data?.message ||
        err?.message ||
        "Login failed"
      );
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-hero">
          <div className="brand-lockup">
            <img src="/favicon.svg" alt="XTTEN logo" />
            <div>
              <span className="brand-kicker">XTTEN</span>
              <h1>XTTEN, tuned for team operations.</h1>
            </div>
          </div>

          <Paragraph className="hero-copy">
            View your team, company, and role in one focused workspace.
            The signed-in team is shown immediately after authentication.
          </Paragraph>

          <Space wrap size={10} className="feature-tags">
            <Tag icon={<TeamOutlined />} color="blue">Team View</Tag>
            <Tag icon={<CheckCircleOutlined />} color="green">Work Overview</Tag>
            <Tag icon={<FileDoneOutlined />} color="gold">Apply Leave</Tag>
            <Tag icon={<LogoutOutlined />} color="red">Sign Out</Tag>
          </Space>

          <div className="login-preview">
            <div>
              <Text type="secondary">Visible after login</Text>
              <Title level={3}>Your team, company, and role</Title>
            </div>
            <div className="preview-row">
              <span>Team</span>
              <strong>From backend login payload</strong>
            </div>
          </div>
        </section>

        <Card className="login-card">
          <div className="login-card-head">
            <img src="/favicon.svg" alt="XTTEN" />
            <div>
              <h2>Log into XTTEN</h2>
              <p>Use your username to continue.</p>
            </div>
          </div>

          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="account"
              rules={[{ required: true, message: "Please enter username" }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Username"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "Please enter password" }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Password"
                size="large"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" size="large" block>
              Login
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}