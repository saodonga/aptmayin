# Hướng dẫn Sử dụng Hệ thống (User & Administrator Manual)
## Hệ thống Máy in Server Từ xa (Remote Print Server)

Tài liệu này hướng dẫn người dùng cuối và quản trị viên cách tương tác với giao diện Web ứng dụng.

---

## 1. Đăng nhập Hệ thống

1. Truy cập vào địa chỉ Web của hệ thống (ví dụ: `http://localhost:3000` hoặc IP của máy chủ).
2. Hệ thống sẽ tự động chuyển hướng bạn tới trang Đăng nhập.
3. Click vào nút **Đăng nhập bằng Google**.
4. Sử dụng tài khoản Google nội bộ công ty được ủy quyền để truy cập hệ thống.
5. Nếu đăng nhập thành công, bạn sẽ được đưa về Trang chủ Dashboard.

---

## 2. Giao diện Trang chủ Dashboard

Giao diện chính được chia thành các khu vực trực quan:
*   **Thanh Sidebar (Trái):**
    *   **Thang trạng thái Hạn mức (Quota):** Hiển thị thanh tiến trình lượng trang bạn đã in trên tổng số trang tối đa được cấp trong tháng (ví dụ: `24/100 trang`).
    *   **Thông tin cá nhân:** Hiển thị Tên, Email, Ảnh đại diện Google và nút **Đăng xuất**.
    *   **Menu Tabs:** Chuyển đổi qua lại giữa các khu vực làm việc (In tài liệu, Lịch sử in, Báo cáo & Thống kê, Quản lý hệ thống).
*   **Khu vực làm việc chính (Phải):** Thay đổi linh hoạt dựa trên Tab được chọn từ Menu.

---

## 3. Hướng dẫn In tài liệu (Dành cho mọi thành viên)

Để gửi một lệnh in ấn từ xa, bạn thực hiện theo các bước sau tại Tab **In tài liệu**:

1.  **Tải tài liệu lên:** 
    *   Click vào khung nét đứt màu xám **Tải tài liệu lên** để chọn file từ máy tính của bạn, hoặc kéo thả trực tiếp file vào khu vực này.
    *   Hệ thống hỗ trợ các định dạng: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.docx`, `.xlsx`.
2.  **Chọn máy in:** Chọn máy in đích mong muốn từ menu thả xuống (ví dụ: `HP 404 Kế Toán - Tầng 2`).
3.  **Cấu hình thông số in:**
    *   *Khổ giấy:* Chọn khổ giấy `A4 (tiêu chuẩn)`, `A3 (khổ lớn)` hoặc `Letter`.
    *   *Số bản in (copies):* Nhập số lượng bản sao cần in (ví dụ: `2`).
    *   *Chế độ in mặt:* Chọn `In 2 mặt` để tiết kiệm giấy hoặc `In 1 mặt`.
    *   *Chế độ màu:* Chọn `Đen trắng` (tiết kiệm mực) hoặc `Màu sắc` (nếu máy in hỗ trợ in màu).
4.  **Bắt đầu in:**
    *   Click nút **Bắt đầu in tài liệu**.
    *   Hệ thống sẽ tiến hành đếm số trang. Nếu hạn mức còn lại của bạn nhỏ hơn tổng số trang in thực tế (`số trang của file * số bản sao`), hệ thống sẽ từ chối in và hiển thị thông báo lỗi màu đỏ.
    *   Nếu quota hợp lệ, lệnh in sẽ được gửi đi. Màn hình sẽ hiển thị thông báo thành công màu xanh lá.

---

## 4. Xem Lịch sử và Báo cáo

### 4.1. Xem Lịch sử in
*   Truy cập Tab **Lịch sử in** để kiểm tra danh sách các file bạn đã in.
*   Bảng nhật ký hiển thị: Tên file, Máy in sử dụng, khổ giấy, chế độ mặt in (2 mặt/1 mặt), chế độ màu, tổng số trang đã tiêu hao, trạng thái in (Thành công/Thất bại/Đang xử lý) và mốc thời gian cụ thể.

### 4.2. Báo cáo thống kê (Analytics)
*   Truy cập Tab **Báo cáo & Thống kê** để xem báo cáo hoạt động:
    *   **Thống kê tổng:** Tổng số Job in đã tạo, tổng số trang in thành công, tỷ lệ in 2 mặt (tỷ lệ Eco thân thiện môi trường), số job in lỗi.
    *   **Biểu đồ cột:** Trực quan hóa tải lượng in ấn của 7 lượt in gần nhất của bạn.
    *   **Biểu đồ phân bổ:** Thanh tiến trình thống kê phần trăm phân bổ số lượng trang in trên từng máy in hệ thống.

---

## 5. Hướng dẫn Quản trị Hệ thống (Dành riêng cho ADMIN)

*Nếu tài khoản của bạn được thiết lập quyền `ADMIN`, bạn sẽ thấy Tab **Quản lý hệ thống** xuất hiện ở Sidebar.*

### 5.1. Thêm máy in mới
1. Điền thông tin máy in tại form **Thêm máy in mới**:
   *   **Tên CUPS:** Tên đăng ký máy in trên máy chủ CUPS (viết thường, không dấu, khoảng trắng thay bằng dấu gạch dưới `_`). Ví dụ: `hp_404_accounting`.
   *   **Tên hiển thị:** Tên dễ hiểu hiển thị trên UI Web. Ví dụ: `Máy in HP 404 Kế Toán`.
   *   **Địa chỉ kết nối:** URI kết nối IPP của máy in. Ví dụ: `ipp://cups-server:631/printers/hp_404_accounting`.
   *   **Vị trí:** Vị trí vật lý đặt máy in để người dùng dễ tìm.
   *   Tích chọn các ô hỗ trợ in màu hoặc in 2 mặt nếu phần cứng máy in có các chức năng này.
2. Click nút **Đăng ký máy in**. Máy in mới sẽ xuất hiện ở bảng cấu hình bên phải và có sẵn trên form in ấn của người dùng.

### 5.2. Quản lý Thành viên & Điều chỉnh Hạn mức (Quota)
Bảng **Quản lý Thành viên & Phân quyền** hiển thị toàn bộ người dùng đã đăng nhập hệ thống:
*   **Chỉnh sửa Hạn mức (Quota):** Click vào chữ **Chỉnh sửa** bên cạnh hạn mức quota của user. Nhập số trang tối đa mới được phép in mỗi tháng rồi ấn OK để áp dụng tức thì.
*   **Thay đổi Vai trò (Role):** Click vào nút Role của thành viên (ví dụ: `USER` hoặc `ADMIN`) để đảo vị trí phân quyền của người đó.
*   **Xóa tài khoản:** Click nút **Xóa tài khoản** để thu hồi quyền truy cập của thành viên đó khỏi hệ thống.
*   *Lưu ý bảo mật:* Nút sửa đổi quyền và xóa tài khoản của các quản trị viên hệ thống tối cao (được cấu hình trong `ADMIN_EMAILS`) sẽ bị khóa và ẩn (disabled) trên giao diện này để đảm bảo an toàn hệ thống.
