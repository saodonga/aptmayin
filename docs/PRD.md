# Tài liệu Yêu cầu Sản phẩm (Product Requirement Document - PRD)
## Hệ thống Máy in Server Từ xa (Remote Print Server)

---

## 1. Mục tiêu Dự án (Project Goals)
Hệ thống Remote Print Server được xây dựng nhằm giải quyết nhu cầu in ấn tập trung qua mạng nội bộ (LAN) hoặc từ xa (Internet) trong môi trường doanh nghiệp hoặc hộ gia đình. Dự án tích hợp các công cụ kiểm soát chi phí, phân quyền rõ ràng, báo cáo thống kê trực quan và cơ chế bảo mật cấp độ quản trị viên.

### Các mục tiêu chính:
* **In ấn từ xa:** Người dùng có thể gửi tài liệu cần in qua giao diện Web mà không cần cài đặt driver máy in trực tiếp lên máy tính cá nhân.
* **Kiểm soát quota (Hạn mức):** Giới hạn số lượng trang in mỗi tháng của từng nhân viên nhằm chống lãng phí giấy và mực in.
* **Thống kê hoạt động:** Theo dõi chi tiết lượng in ấn theo thời gian và từng máy in để phục vụ mục đích báo cáo hành chính.
* **Triển khai đóng gói (Dockerized):** Dễ dàng cài đặt và vận hành trên hệ điều hành Ubuntu Server thông qua Docker Compose.

---

## 2. Vai trò Người dùng (User Roles)

Hệ thống phân chia thành 3 vai trò chính để quản lý quyền hạn truy cập:

| Vai trò | Mô tả quyền hạn |
| :--- | :--- |
| **USER** (Người dùng) | - Đăng nhập qua tài khoản Google nội bộ công ty.<br>- Upload file (PDF, Docx, Hình ảnh...) và chọn chế độ in (Khổ giấy, in 2 mặt, số bản sao).<br>- Theo dõi hạn mức in ấn còn lại trong tháng.<br>- Xem nhật ký in ấn cá nhân. |
| **DEPT_MANAGER** (Quản lý) | - Sở hữu toàn bộ quyền của **USER**.<br>- Xem báo cáo thống kê in ấn tổng thể của phòng ban được phân công quản lý. |
| **ADMIN** (Quản trị viên) | - Sở hữu toàn bộ quyền của **USER** và **DEPT_MANAGER**.<br>- Quản lý danh sách máy in trên hệ thống (Thêm/Sửa/Xóa máy in).<br>- Quản lý người dùng: Điều chỉnh hạn mức Quota in ấn hàng tháng, nâng cấp/hạ cấp vai trò thành viên.<br>- Xem toàn bộ lịch sử in ấn của tất cả mọi người trên hệ thống. |

---

## 3. Các Tính năng Cốt lõi (Core Features)

### 3.1. Xác thực & Đăng nhập
* **Google OAuth:** Đăng nhập một chạm bằng tài khoản Google. Chỉ chấp nhận các tài khoản có email hợp lệ và đồng bộ tự động vào cơ sở dữ liệu.
* **Bảo vệ Admin mặc định:** Các tài khoản quản trị viên hệ thống tối cao (được cấu hình trong `ADMIN_EMAILS`) được cài đặt cứng dưới quyền ADMIN cao nhất và không thể bị sửa vai trò hay xóa bỏ từ giao diện ứng dụng.

### 3.2. Quản lý Yêu cầu In ấn
* **Upload tài liệu:** Hỗ trợ kéo thả, chọn tệp các định dạng tài liệu PDF, DOCX, XLSX và các định dạng ảnh phổ biến.
* **Đếm trang thông minh:** Tự động phân tích file PDF tải lên và nhân bản số lượng in để cập nhật số trang thực tế cần in trước khi thực thi.
* **Cấu hình in:** Cho phép chọn máy in đích, lựa chọn khổ giấy (A4/A3), tùy chọn in 2 mặt (`duplex`) giúp tiết kiệm giấy, và chế độ màu (Màu/Trắng đen).
* **Kiểm tra Quota:** Chặn in ngay lập tức nếu số trang in yêu cầu vượt quá hạn mức trang còn lại của tháng.

### 3.3. Nhật ký & Thống kê trực quan
* **Nhật ký in ấn:** Lưu vết thời gian, người thực hiện, tên tệp, kích thước tệp, máy in sử dụng, cấu hình in, số trang và trạng thái in (Thành công / Thất bại).
* **Biểu đồ Analytics:** Hiển thị trực quan dữ liệu in ấn dưới dạng biểu đồ cột và thanh tiến trình nhằm giúp quản trị viên theo dõi tải lượng của từng máy in và lượng giấy tiêu thụ.

### 3.4. Quản lý Hệ thống (Admin Tools)
* **Quản lý máy in:** Thêm cấu hình kết nối IPP (Internet Printing Protocol) của máy in CUPS nội bộ.
* **Quản lý Quota thành viên:** Cho phép admin tăng hoặc giảm hạn mức số trang được phép in trong tháng đối với từng nhân viên.

---

## 4. Yêu cầu Kỹ thuật (Technical Specifications)

* **Framework:** Next.js (App Router, React, Tailwind CSS, TypeScript).
* **Database:** Neon.tech (PostgreSQL serverless) kết nối qua Prisma ORM.
* **Print Server:** CUPS Server chạy trong Docker (sử dụng cổng `631`).
* **Protocol:** IPP (Internet Printing Protocol) truyền dữ liệu buffer file trực tiếp từ API Next.js tới CUPS.
* **Môi trường chạy:** Docker Compose trên máy chủ Ubuntu Server 20.04 LTS hoặc mới hơn.
