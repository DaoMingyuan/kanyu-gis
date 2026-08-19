# sample.gdb —— 测试夹具（第九十七轮）

GDB 文件地理数据库为**目录形态**。本目录仅作 `catalog.list` 整目录登记契约的
占位夹具：walk 遇 `.gdb` 目录登记为数据库条目（`ext: 'gdb'`, `dir: true`）且
**不深入扫描**（本文件若被扫入 items 即契约破裂）。

内核零 C 依赖无 GDAL，GDB 读取由 `gdbUnsupported` 守卫明确报错
（指引转换 GeoPackage / Shapefile / GeoJSON）。
