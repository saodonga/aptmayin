# Tài liệu Mô tả Module (Module Architecture & Specifications)
## Hệ thống Máy in Server Từ xa (Remote Print Server)

---

## 1. Cấu trúc Thư mục Dự án

Mã nguồn dự án được thiết kế theo cấu trúc thư mục tiêu chuẩn của Next.js (App Router, TypeScript):

```
Mayintuxa/
├── docs/                     # Tài liệu PRD, Module, HDSD, Triển khai
├── prisma/                   # Cấu hình Prisma Database
│   └── schema.prisma         # Định nghĩa các Model bảng dữ liệu
├── public/                   # Thư mục chứa tài nguyên tĩnh (images, icons)
├── src/
│   ├── app/                  # Các routes và API endpoint
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   ├── printers/ # API lấy/thêm cấu hình máy in (ADMIN)
│   │   │   │   └── users/    # API danh sách user & chỉnh sửa quota/role
│   │   │   ├── auth/         # Catch-all route cho NextAuth API
│   │   │   ├── history/      # API lấy lịch sử in ấn của user/admin
│   │   │   └── print/        # API nhận file in, đếm trang và gửi lệnh in
│   │   ├── login/            # Giao diện Trang Đăng nhập
│   │   ├── layout.tsx        # Cấu hình bao bọc giao diện chung & Providers
│   │   └── page.tsx          # Giao diện chính (Dashboard, Lịch sử, Thống kê, Quản trị)
│   ├── components/
│   │   └── Providers.tsx     # Bọc SessionProvider cho ứng dụng client-side
│   ├── lib/
│   │   ├── auth.ts           # Cấu hình NextAuth (callbacks, providers)
│   │   └── db.ts             # Khởi tạo duy nhất đối tượng PrismaClient kết nối Neon.tech
│   ├── types/
│   │   ├── ipp.d.ts          # Khai báo kiểu TypeScript toàn cục cho module 'ipp'
│   │   └── next-auth.d.ts    # Khai báo bổ sung trường id và role cho NextAuth
│   └── middleware.ts         # Bảo vệ route chính chống truy cập không xác thực
├── Dockerfile                # File định nghĩa cách build container ứng dụng Next.js
├── docker-compose.yml        # Điều phối môi trường chạy Next.js & CUPS Server
└── next.config.ts            # Cấu hình ứng dụng Next.js (chặn bundle ipp)
```

---

## 2. Mô tả các Module Kỹ thuật cốt lõi

### 2.1. Module Cơ sở dữ liệu (Neon PostgreSQL via Prisma)
Hệ thống sử dụng các bảng quan hệ sau:
*   **User:** Lưu trữ thông tin người dùng được định danh từ tài khoản Google. Hỗ trợ trường `role` (USER, DEPT_MANAGER, ADMIN) để kiểm soát quyền hạn, `pageQuota` để đặt hạn mức trang in mỗi tháng, và `pagesPrinted` lưu tổng số trang người dùng thực tế đã in trong chu kỳ hiện tại.
*   **Printer:** Quản lý các máy in có kết nối với server. Trường `connection` chứa URI kết nối CUPS (ví dụ: `ipp://cups-server:631/printers/hp_laserjet_404`), `status` chỉ định trạng thái trực tuyến của máy in (IDLE, PRINTING, OFFLINE).
*   **PrintJob:** Lưu trữ nhật ký chi tiết của mọi yêu cầu in. Nó liên kết khóa ngoại với `User` và `Printer`. Lưu lại các thiết lập của lệnh in như khổ giấy (`paperSize`), tùy chọn in hai mặt (`duplex`), in màu (`colorMode`), trạng thái lệnh in (`status` là PENDING, PROCESSING, SUCCESS hoặc FAILED) và chi tiết lỗi nếu lệnh in bị từ chối từ máy in.

### 2.2. Module Xác thực & Đồng bộ JIT (NextAuth & JIT Provisioning)
Xác thực tích hợp qua **Google OAuth** được xử lý trong file [src/lib/auth.ts](file:///d:/AnhPT/Code/Mayintuxa/src/lib/auth.ts):
*   **signIn callback:** Khi đăng nhập thành công từ Google, callback sẽ lấy email người dùng. 
    *   Nó kiểm tra email xem có nằm trong danh sách `ADMIN_EMAILS` cấu hình ở file `.env` hay không. 
    *   Tự động cập nhật hoặc tạo mới bản ghi người dùng trong Neon database (chế độ JIT). Nếu trùng khớp email admin mặc định, vai trò sẽ được đồng bộ cứng là `ADMIN`.
*   **jwt & session callbacks:** Lấy trường `id` và `role` từ cơ sở dữ liệu để đính kèm vào session của NextAuth. Điều này giúp các Component Frontend biết được người dùng hiện tại là ADMIN để hiển thị Tab Quản trị hệ thống.

### 2.3. Module In ấn và Quản lý Hạn mức (Print API)
Được triển khai trong API endpoint [src/app/api/print/route.ts](file:///d:/AnhPT/Code/Mayintuxa/src/app/api/print/route.ts):
*   **Trình đếm trang:** API nhận file gửi từ form client. Nếu là file PDF, API dùng `pdf-lib` nạp tài liệu và đọc số trang qua hàm `pdfDoc.getPageCount()`. Nếu là định dạng ảnh hoặc tệp khác, mặc định đếm là 1 trang để đối soát.
*   **Kiểm tra Quota:** Tính toán tổng số trang của lệnh in (`totalPages = pageCount * copies`). Đọc trường `pagesPrinted` và `pageQuota` từ tài khoản người dùng trong DB. Nếu tổng số trang mới khiến user vượt hạn mức, API trả về lỗi `403 Forbidden` và hủy in.
*   **IPP Printing Client:** 
    *   Nếu bật biến môi trường `MOCK_PRINTING="true"`, API giả lập lệnh in thành công sau 1.5 giây để kiểm tra giao diện và luồng DB.
    *   Nếu `MOCK_PRINTING="false"`, API khởi tạo Client kết nối IPP qua thư viện `ipp` dựa trên địa chỉ kết nối `Printer.connection`. API đóng gói buffer file kèm thuộc tính cấu hình và truyền sang CUPS. Cập nhật trạng thái in dựa trên kết quả phản hồi của CUPS.

### 2.4. Module Bảo vệ Admin mặc định (Supreme Admin Protection)
Được triển khai tại API quản trị thành viên [src/app/api/admin/users/[id]/route.ts](file:///d:/AnhPT/Code/Mayintuxa/src/app/api/admin/users/%5Bid%5D/route.ts):
*   Khi có yêu cầu cập nhật vai trò (PATCH) hoặc xóa tài khoản (DELETE), API lấy email của tài khoản đích từ DB.
*   Kiểm tra chéo với danh sách `ADMIN_EMAILS` từ `.env`.
*   Nếu email đích là admin hệ thống mặc định (được cấu hình trong `ADMIN_EMAILS`), hệ thống từ chối thực thi và trả về mã lỗi `403 Forbidden` ngay lập tức, ngăn chặn hoàn toàn việc quản trị viên tự làm hỏng hệ thống hoặc bị hạ quyền/xóa tài khoản bởi các Admin phụ khác.

---

## 3. Danh sách các API Endpoints chính

| Endpoint | Phương thức | Phân quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `/api/auth/[...nextauth]` | GET / POST | Public | Xử lý các luồng đăng nhập, callback và session của NextAuth. |
| `/api/print` | GET | USER | Lấy danh sách máy in đang có trên hệ thống để hiển thị lên form chọn. |
| `/api/print` | POST | USER | Nhận file tải lên, tính toán trang in, kiểm tra quota, gửi in qua IPP/Mock và cập nhật lịch sử. |
| `/api/history` | GET | USER / ADMIN | Lấy nhật ký in ấn. *USER*: Chỉ xem của mình; *ADMIN*: Xem toàn bộ hệ thống. |
| `/api/admin/users` | GET | ADMIN | Trả về danh sách tất cả người dùng trong hệ thống kèm lượng in và quota của họ. |
| `/api/admin/users/[id]` | PATCH | ADMIN | Thay đổi hạn mức in hoặc đổi vai trò của user. Chặn thao tác với 2 admin mặc định. |
| `/api/admin/users/[id]` | DELETE | ADMIN | Xóa một tài khoản người dùng khỏi hệ thống. Chặn xóa với 2 admin mặc định. |
| `/api/admin/printers` | GET | ADMIN | Trả về thông tin đầy đủ các máy in trong hệ thống phục vụ cấu hình. |
| `/api/admin/printers` | POST | ADMIN | Đăng ký thêm cấu hình một máy in mới trên cơ sở dữ liệu. |
