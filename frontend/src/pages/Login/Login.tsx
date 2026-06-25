import { Button, Card, Form, Input, message } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { login } from "../../services/auth";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      const data = await login(values.email, values.password);

      localStorage.setItem("xtten_token", data.access_token);
      localStorage.setItem("xtten_user", JSON.stringify(data.user));

      message.success("Login successful");
      navigate("/dashboard");
    } catch {
      message.error("Invalid email or password");
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card">
        <h1>XTTEN Sync</h1>
        <p>Employee Monitoring & Office Automation</p>

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="email"
            rules={[{ required: true, message: "Please enter email" }]}
          >
            <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
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