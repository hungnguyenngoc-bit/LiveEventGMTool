# Live Event GM Tool — User Guide

## 1. Tổng quan
Live Event GM Tool là công cụ quản lý timeline cho các sự kiện live theo **track** và **season**. Bạn có thể tạo, kéo thả, resize, sắp xếp, import/export cấu hình và theo dõi lịch trình theo nhiều múi giờ.

## 2. Khái niệm chính
- **Track**: Nhóm sự kiện (ví dụ: `LE1`, `LE2`). Mỗi track có nhiều season.
- **Season**: Một khoảng thời gian có `start` và `end` trên timeline.
- **Timeline**: Trục thời gian hiển thị tất cả track và season.

**Quy tắc quan trọng:**
- Các season **trong cùng một track không được overlap**.
- Khi kéo/resize, season sẽ bị **clamp** để không chồng lấn.

## 3. Giao diện chính
- **Tracks panel (bên trái)**: Danh sách track, có thể ẩn/hiện, đổi tên, xóa.
- **Timeline (bên phải)**: Hiển thị các season theo thời gian.
- **Topbar**: Tùy chọn múi giờ, zoom, tạo mới, import/export.

## 4. Thao tác cơ bản
### 4.1 Tạo season mới
1. Bấm **New Season**.
2. Nhập `Track`, `Calendar ID`, `Start time`, `End time`.
3. Nhấn **Create**.

Nếu season bị overlap trong track → hệ thống sẽ từ chối tạo.

### 4.2 Chọn season
- Click vào season để chọn.
- `Ctrl/Cmd + Click` để chọn nhiều (multi-select).
- `Ctrl/Cmd + A` để chọn toàn bộ season.
- Click vào vùng trống để bỏ chọn.

### 4.3 Kéo (drag) season
- **Left mouse drag**: kéo season để di chuyển.
- Nếu đang multi-select, kéo 1 season sẽ kéo tất cả (cùng offset).

### 4.4 Resize season
- Kéo mép trái/phải của season để thay đổi start/end.
- Multi-select resize: toàn bộ season được resize cùng delta.

### 4.5 Multi-select bằng khung chọn (Marquee)
- **Right mouse drag** (chuột phải) trên timeline để vẽ khung chọn.
- Thả chuột để chọn các season trong khung.
- `Ctrl/Cmd` + drag để cộng thêm vào selection.

### 4.6 Xóa season
- Chọn 1 hoặc nhiều season.
- Nhấn `Delete` hoặc `Backspace`.

### 4.7 Duplicate season
- Chọn 1 season.
- Nhấn `D` để nhân bản sang sau (giữ nguyên duration).

## 5. Quản lý Track
### 5.1 Đổi tên track
- Click vào tên track để sửa.

### 5.2 Sắp xếp track
- Drag & drop track trong danh sách để thay đổi thứ tự.

### 5.3 Ẩn/hiện track
- Click icon con mắt để toggle.

### 5.4 Xóa track
- Click nút **X** ở cuối track.

## 6. Zoom & di chuyển timeline
### 6.1 Zoom
- **Alt + Scroll**: Zoom theo vị trí con trỏ (mượt).
- Hoặc nhập % ở ô **Zoom %**.

Giới hạn zoom:
- Min: **0.1%**
- Max: **1000%**

### 6.2 Pan (cuộn ngang & dọc)
- **Left mouse drag** trên vùng trống timeline để pan.
- Cuộn chuột để scroll dọc.
- Giữ `Shift` + scroll để scroll ngang.

## 7. Ruler (thang thời gian)
- Ruler ngày/giờ tự điều chỉnh mật độ tick theo mức zoom.
- Khi zoom rất nhỏ, ruler ngày sẽ chuyển sang dạng theo tháng.
- Khi zoom < 40%: ẩn ruler giờ.
- Khi zoom < 100%: ẩn vạch chỉ ngày.

## 8. Import / Export
### 8.1 Export
1. Nhấn **Export config**.
2. Copy JSON cấu hình.

### 8.2 Import
1. Nhấn **Import config**.
2. Dán JSON đúng format:

```json
{
  "entries": [
    {
      "eventName": "LE1",
      "calendarId": "101",
      "startDateTime": "2026-02-06T09:00:00+07:00",
      "endDateTime": "2026-02-06T12:00:00+07:00",
      "minDurationHours": 0,
      "urlConfig": "https://..."
    }
  ]
}
```

## 9. Thời gian & múi giờ
- Chọn múi giờ ở topbar.
- Timeline tự render theo múi giờ đã chọn.

## 10. Lưu trữ dữ liệu
- Dữ liệu được lưu vào **localStorage** của trình duyệt.
- Khi refresh trang, dữ liệu vẫn giữ nguyên.

## 11. Phím tắt
- `Delete / Backspace`: Xóa season đang chọn.
- `Ctrl/Cmd + A`: Chọn tất cả season.
- `Ctrl/Cmd + Z`: Undo.
- `Ctrl/Cmd + Shift + Z` hoặc `Ctrl/Cmd + Y`: Redo.
- `D`: Duplicate season.

## 12. Lưu ý & Best Practices
- Không để season overlap trong cùng track.
- Dùng zoom nhỏ để xem toàn cảnh nhiều tháng/năm.
- Dùng multi-select để di chuyển nhiều season đồng thời.

---

Nếu cần thêm tài liệu hướng dẫn cho admin, export chuẩn sản phẩm, hoặc template data, hãy báo để mình bổ sung.
