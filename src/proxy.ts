import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

// Chặn truy cập trang chủ nếu chưa đăng nhập
export const config = {
  matcher: ["/"],
};
