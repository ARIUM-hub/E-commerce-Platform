# 袜子商城后台商品工作台设计文档

- 日期：2026-07-30
- 主题：商品新增/编辑完整表单、图片上传、SKU 批量编辑
- 方案：演示级真实商品工作台
- 分支基础：`feature/socks-after-sales-payment-admin`

## 1. 目标

把现有后台“商品”和“库存”能力升级为可运营的商品工作台。管理员可以在后台新增商品、编辑商品主数据、上传商品图片、生成和批量维护 SKU，并且保存后前台商品列表、详情页、购物车和结算库存校验都读取同一套 SQLite 数据。

本阶段继续保持演示级真实系统，不接对象存储、CDN、复杂 PIM、CSV 导入或富文本编辑器。图片上传保存到本地 `public/uploads/products/`，商品图片相册保存为可访问 URL。

## 2. 当前上下文

项目已经具备：

- SQLite 商品表：`products`
- SQLite SKU 表：`product_variants`
- 后台商品摘要接口：`GET /api/admin/products`
- 后台库存接口：`GET /api/admin/inventory`
- 单 SKU 库存编辑接口：`PATCH /api/admin/inventory/:skuId`
- 前台商品接口：`GET /api/products`
- 商品详情图库字段：`gallery`
- 商品颜色、材质、尺码表字段：`colors`、`materials`、`sizeChart`
- 管理员权限：登录用户邮箱 `admin@socks.test`
- 后台视图：`socks-product-list.html?view=admin`

当前不足：

- 商品后台只能查看摘要，不能新增或编辑商品
- 图片只能来自 seed/payload，不能通过后台上传
- SKU 只能逐行编辑库存，不能批量生成或批量改库存/阈值/上下架
- 商品 payload 与 `product_variants` 的同步逻辑还没有统一后台写入入口

## 3. 范围

### 3.1 商品新增

后台“商品”tab 增加“新增商品”按钮。点击后在同页展开内嵌表单面板，不新增独立路由。

新增商品字段：

- 商品 ID：如 `sock-13`，必填且唯一
- 系列：`series`
- 中文标题：`title`
- 英文标题：`localizedContent.en-US.title`
- 分类：`categoryKey`，限定 `sport`、`daily`、`crew`、`no-show`
- 中文分类名：`categoryLabel`
- 英文分类名：`localizedContent.en-US.categoryLabel`
- 价格：`price`
- 原价：`originalPrice`
- 折扣标签：`discount`
- 中文描述：`description`
- 英文描述：`localizedContent.en-US.description`
- 推荐：`isRecommended`
- 高评分标签：`isTopRated`
- Best Seller：`isBestSeller`
- 评分：`ratingValue`
- 评价数：`reviewCount`
- 最近购买文案：`recentlyBoughtLabel`
- 配送文案：`shippingLabel`
- 预计送达文案：`deliveryEstimate`
- 视觉字段：`visualTone`、`visualShadow`、`visualAccent`、`visualPattern`
- 颜色：`colors`
- 材质：`materials`
- 尺码表：`sizeChart`
- SKU 列表：`variants`
- 图片相册：`gallery`

新增后规则：

- 写入 `products`
- 写入 `product_variants`
- 商品 payload 内的 `variants` 与 `product_variants` 表保持一致
- 前台商品列表和详情页立即可见

### 3.2 商品编辑

后台商品列表每行增加“编辑”按钮。点击后同页展开商品表单，加载现有商品完整 payload 和 SKU。

可编辑内容：

- 商品主字段
- 中英文内容
- 价格和原价
- 分类
- 推荐/高评分/Best Seller 标记
- 颜色和材质
- 尺码表
- 图片相册
- SKU 列表和库存

不可编辑内容：

- 已有商品 ID 不允许改名

原因：商品 ID 已被购物车、订单、评论、问答、最近浏览、收藏等模块引用。允许改 ID 会引入级联迁移，本阶段不做。

### 3.3 图片上传

图片上传采用本地文件存储：

- 上传路径：`public/uploads/products/`
- 返回 URL：`/public/uploads/products/<safe-file-name>`
- 后台表单将 URL 写入商品 `gallery`
- 支持多图上传
- 支持图片预览
- 支持删除图库项
- 支持设置图片 alt
- 支持调整图库顺序

上传限制：

- 仅管理员可上传
- 允许类型：`image/jpeg`、`image/png`、`image/webp`、`image/svg+xml`
- 单图最大 3MB
- 文件名由服务端生成，避免用户文件名注入路径
- 保存失败返回标准错误

不做：

- 图片裁剪
- CDN
- 对象存储
- 图片压缩
- 素材库复用

### 3.4 SKU 模板生成

商品表单增加 SKU 模板工具：

- 尺码输入支持范围：`35-45`
- 尺码输入支持列表：`39,40,41`
- 范围和列表可混用：`35-38,40,42-45`
- 自动生成 SKU ID：`${productId}-${size}`
- 默认颜色：来自表单颜色第一项
- 默认材质：来自表单材质第一项
- 默认库存：用户输入，默认 `10`
- 默认低库存阈值：用户输入，默认 `5`
- 默认可售：`true`

生成规则：

- 新增商品：生成完整 SKU 列表
- 编辑商品：已存在 SKU 保留并更新模板指定字段；新增尺码追加 SKU；未出现在模板里的旧 SKU 默认保留，避免误删历史库存
- SKU ID 必须唯一
- 每个商品至少保留一个可售或不可售 SKU

### 3.5 SKU 批量编辑

表单内 SKU 表格支持批量操作：

- 批量设置库存
- 批量设置低库存阈值
- 批量设置是否可售
- 批量设置颜色
- 批量设置材质

操作方式：

- SKU 行可勾选
- 批量工具栏只作用于已勾选 SKU
- 没有勾选 SKU 时批量按钮禁用
- 单行仍可编辑库存、阈值、颜色、材质、可售状态

校验：

- 库存必须是 `0` 到 `9999` 的整数
- 低库存阈值必须是 `0` 到 `999` 的整数
- 尺码不能为空
- SKU ID 不能为空且唯一
- 同一商品下尺码不能重复

## 4. 后端设计

### 4.1 仓储模块

新增或扩展：

- `lib/repositories/admin-products.js`

职责：

- 读取后台商品完整详情
- 校验商品 payload
- 创建商品和 SKU
- 更新商品和 SKU
- 同步 `products.payload` 与 `product_variants`
- 生成 SKU 模板
- 标准化图库、颜色、材质、尺码表

保留 `lib/repositories/admin.js` 的聚合职责。商品工作台写入逻辑不继续塞进 `admin.js`，避免后台仓储越来越臃肿。

### 4.2 API

新增接口：

- `GET /api/admin/products/:id`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `POST /api/admin/products/:id/images`

保留接口：

- `GET /api/admin/products`
- `GET /api/admin/inventory`
- `PATCH /api/admin/inventory/:skuId`

### 4.3 `GET /api/admin/products/:id`

返回完整商品：

```json
{
  "ok": true,
  "product": {
    "id": "sock-01",
    "title": "极简中筒袜",
    "localizedContent": {},
    "gallery": [],
    "variants": [],
    "sizeChart": []
  }
}
```

错误码：

- `ADMIN_PRODUCT_NOT_FOUND`

### 4.4 `POST /api/admin/products`

请求：

```json
{
  "product": {
    "id": "sock-13",
    "series": "New Base",
    "title": "新品中筒袜",
    "categoryKey": "crew",
    "price": 39,
    "originalPrice": 59,
    "description": "柔软日常袜。",
    "localizedContent": {
      "en-US": {
        "title": "New Crew Socks",
        "categoryLabel": "Crew Socks",
        "description": "Soft daily socks."
      }
    },
    "gallery": [],
    "variants": []
  }
}
```

返回：

```json
{
  "ok": true,
  "product": {}
}
```

错误码：

- `ADMIN_PRODUCT_ID_REQUIRED`
- `ADMIN_PRODUCT_ID_INVALID`
- `ADMIN_PRODUCT_DUPLICATE`
- `ADMIN_PRODUCT_TITLE_REQUIRED`
- `ADMIN_PRODUCT_CATEGORY_INVALID`
- `ADMIN_PRODUCT_PRICE_INVALID`
- `ADMIN_PRODUCT_VARIANTS_REQUIRED`
- `ADMIN_PRODUCT_VARIANT_INVALID`

### 4.5 `PATCH /api/admin/products/:id`

请求结构与新增一致，但商品 ID 来自路径。请求体内如果带 `product.id`，必须等于路径 ID。

规则：

- 商品不存在返回 `ADMIN_PRODUCT_NOT_FOUND`
- 更新商品 payload
- 替换该商品的 `product_variants` 行为最终保存后的 SKU 列表
- 如果某 SKU 已存在于未完成购物车，不影响购物车已保存数据；后续加购/结算会按新库存校验
- 历史订单商品快照不变

### 4.6 `POST /api/admin/products/:id/images`

请求：

- `multipart/form-data`
- 字段名：`image`

返回：

```json
{
  "ok": true,
  "image": {
    "id": "img-20260730-0001",
    "src": "/public/uploads/products/sock-01-img-20260730-0001.webp",
    "alt": "sock-01 product image"
  }
}
```

错误码：

- `ADMIN_PRODUCT_NOT_FOUND`
- `ADMIN_IMAGE_REQUIRED`
- `ADMIN_IMAGE_TYPE_INVALID`
- `ADMIN_IMAGE_TOO_LARGE`
- `ADMIN_IMAGE_SAVE_FAILED`

## 5. 数据一致性

商品保存事务：

1. 校验商品 payload
2. 校验 SKU 列表
3. 写入或更新 `products`
4. 删除该商品旧 `product_variants`
5. 插入保存后的 SKU 列表
6. 返回标准化商品

事务失败时不写入半成品。

前台一致性：

- `/api/products` 继续通过 SQLite 读取商品和 SKU
- 商品详情页读取同一商品 payload
- 购物车加购读取 `product_variants`
- 结算扣库存仍使用现有库存事务

历史数据：

- 已有订单 `order.items` 快照不回写
- 已有评论、问答、收藏、最近浏览仍通过商品 ID 关联
- 删除商品不在本阶段实现，避免孤儿数据

## 6. 前端设计

### 6.1 后台商品 tab

现有商品 tab 从只读列表升级为商品工作台：

- 顶部操作：新增商品
- 商品表：ID、标题、分类、价格、SKU 数、库存、编辑按钮
- 表单面板：在商品表下方或右侧展开
- 保存后刷新商品表和库存表缓存

### 6.2 内嵌商品表单

表单分区：

- 基础信息：ID、系列、分类、价格、原价、折扣
- 中英文内容：标题、分类名、描述
- 展示标签：推荐、高评分、Best Seller、评分、评价数、最近购买文案
- 视觉/属性：颜色、材质、视觉色值、视觉模式
- 图片相册：上传、预览、alt、删除、排序
- 尺码表：尺码、脚长、US 男码、US 女码
- SKU 批量工具：尺码模板、默认库存、默认阈值、默认颜色、默认材质
- SKU 表格：尺码、SKU ID、颜色、材质、库存、低库存阈值、可售

### 6.3 UI 状态

数据标识建议：

- `data-admin-product-new`
- `data-admin-product-edit`
- `data-admin-product-form`
- `data-admin-product-save`
- `data-admin-product-cancel`
- `data-admin-product-image-upload`
- `data-admin-product-gallery-item`
- `data-admin-sku-template-input`
- `data-admin-sku-generate`
- `data-admin-sku-row`
- `data-admin-sku-bulk-toolbar`
- `data-admin-sku-bulk-apply`

错误展示：

- 表单顶部显示保存失败摘要
- 字段旁显示关键校验错误
- 上传失败显示在图库区域

## 7. 图片上传实现说明

由于项目使用 Node 原生 HTTP server，本阶段不引入重型上传库。

实现策略：

- 在 `lib/http/request-body.js` 或新文件 `lib/http/multipart.js` 增加简单 multipart 解析
- 只支持单文件字段 `image`
- 使用请求体大小限制保护内存
- 服务端生成安全文件名
- 使用 `fs.promises.writeFile` 写入 `public/uploads/products`
- 静态文件服务继续通过现有 `/public/...` 路径访问

如果 multipart 解析实现风险过高，实施计划可把第一步拆成更小的 TDD 单元，先测试 parser 对单文件请求的解析。

## 8. 安全和校验

权限：

- 所有新增接口必须通过 `requireAdmin`
- 普通用户和匿名用户不能创建、编辑或上传图片

输入：

- 商品 ID 限制为小写字母、数字、短横线
- 标题、分类、描述做长度限制
- 价格和原价必须为非负数字，原价应大于等于价格
- 评分范围 `0` 到 `5`
- 评价数必须为非负整数
- SKU 库存和阈值使用整数范围校验
- 图片类型和大小必须校验

输出：

- 返回标准错误 envelope
- 不暴露本地绝对路径
- 上传 URL 只返回 `/public/uploads/products/...`

## 9. 测试策略

API 测试：

- 管理员可读取完整商品详情
- 非管理员不能读取后台商品详情
- 管理员可新增商品并在 `/api/products` 看到
- 新增商品写入 `products` 和 `product_variants`
- 重复商品 ID 被拒绝
- 商品字段缺失或价格非法被拒绝
- 管理员可编辑商品标题、价格、图库和 SKU
- 编辑商品后前台详情同步更新
- SKU 批量生成结果唯一且符合尺码模板
- 图片上传返回本地 URL
- 非图片或超大图片上传被拒绝

UI 测试：

- 后台商品 tab 显示新增按钮和编辑按钮
- 点击新增展开完整商品表单
- 尺码模板生成 SKU 行
- 批量库存工具能更新选中 SKU 行
- 上传图片后出现图库预览
- 保存新商品后商品表出现新行
- 保存后前台列表或详情能看到新商品
- 编辑已有商品后前台详情同步显示新标题或新价格

回归测试：

- 现有库存单行编辑仍可用
- 购物车库存上限仍按 SKU 校验
- 结算扣库存事务不被破坏
- 商品列表筛选、搜索、详情页图库仍可用

## 10. 验收标准

- 管理员能在后台商品 tab 新增一个完整商品
- 管理员能编辑现有商品并保存
- 管理员能上传图片并在商品图库里预览
- 管理员能通过尺码模板生成 SKU
- 管理员能批量修改 SKU 库存、阈值、颜色、材质和可售状态
- 商品保存后前台商品列表和详情页读取最新数据
- SKU 保存后购物车和结算库存校验读取最新库存
- 非管理员无法访问新增/编辑/上传接口
- 全量 Playwright 测试保持通过

## 11. 明确不做

- 不做商品删除
- 不做商品 ID 改名
- 不做 CSV 导入/导出
- 不做图片裁剪、压缩、CDN 或对象存储
- 不做富文本编辑器
- 不做复杂属性模板系统
- 不做多仓库库存
- 不做审核流和发布流
- 不做批量编辑跨多个商品

这些能力可作为后台商品管理后续阶段继续扩展。
