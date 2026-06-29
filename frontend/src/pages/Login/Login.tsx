import { Button, Card, Form, Input, message } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { login } from "../../api/auth";
import "./Login.css";

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
      <Card className="login-card">
        <h1>XTTEN</h1>
        <p>Employee Monitoring & SaaS System</p>

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
          name="account"
          rules={[{ required: true, message: "Please enter email or username" }]}
        >
          <Input
            prefix={<MailOutlined />}
            placeholder="Email or Username"
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
  );
}