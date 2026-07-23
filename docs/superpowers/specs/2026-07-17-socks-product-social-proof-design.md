# 袜子商品卡热卖与近期购买信号设计文档

- 日期：2026-07-17
- 主题：为 `socks-product-list.html` 的商品卡增加热卖与近期购买信号
- 方向：在评分、配送、库存信号基础上，继续补充真实商城的社交证明

## 1. 目标

在保持当前黑、白、灰简约电商基调的前提下，为商品卡加入更接近真实商城的社交证明信息，让用户快速感知：

- 哪些商品更像热卖款
- 最近是否有人持续购买

本轮增强聚焦于：

- `Best seller` 标签
- `X bought in past month` 近期购买文案

## 2. 范围

本次设计包含：

- 商品数据字段扩展
- 商品卡社交证明区设计
- 接口返回字段扩展
- 页面渲染与测试补充

本次设计不包含：

- 实时销量统计
- 用户评论详情页
- 推荐算法调整
- 排序规则变化
- 额外接口

## 3. 设计方向

采用“轻社交证明”方案：

- 保持当前卡片克制节奏
- 引入真实商城常见的热卖与购买人数信息
- 避免使用高饱和促销视觉

结果应体现为：

- 商品更像真实可购买列表
- 信任感更强
- 信息密度增加但不拥挤

## 4. 信息层级

商品卡信息层级调整为：

1. 系列名、商品标题、品类
2. 价格、原价、折扣
3. 评分区
4. 描述文案
5. 配送、库存、社交证明
6. 尺码选择与加入购物车

社交证明继续放在购买动作之前，但不抢价格和评分的主层级。

## 5. 社交证明区设计

### 5.1 组成内容

社交证明区由两部分组成：

- `Best seller` 轻标签，仅部分商品显示
- `recentlyBoughtLabel`
  示例：`2K+ bought in past month`

推荐结构：

```text
Best seller   2K+ bought in past month
```

### 5.2 展现规则

- 所有商品都显示近期购买文案
- 仅部分商品显示 `Best seller`
- `Best seller` 与 `isRecommended`、`isTopRated`、`isLowStock` 独立

### 5.3 风格边界

- 不使用亮橙、亮红或平台金色
- 不使用大面积高对比块
- 不把社交证明做成主标题级元素

## 6. 数据设计

每个商品新增以下字段：

- `recentlyBoughtLabel`
- `isBestSeller`

示例结构：

```json
{
  "id": "sock-02",
  "title": "轻压运动袜",
  "recentlyBoughtLabel": "2K+ bought in past month",
  "isBestSeller": true
}
```

字段规则：

- `recentlyBoughtLabel` 使用字符串
- `isBestSeller` 使用布尔值
- 至少保留一个 `isRecommended: true` 且 `isBestSeller: false` 的商品，用于避免实现误把推荐标记当成热卖标记

## 7. 前端渲染设计

前端在现有 `product-card__commerce` 区块中新增一行 `product-card__social-proof`，负责：

- 渲染 `Best seller` 标签
- 渲染近期购买文案
- 保持与配送、库存区一致的灰阶语言

## 8. 响应式要求

- 窄屏下允许社交证明区内部自动换行
- 标签与文案不能相互遮挡
- 不允许撑破卡片宽度

## 9. 测试设计

需要补充：

- API 字段契约测试
- 指定商品热卖状态测试
- 商品卡渲染测试
- 移动端可读性测试

## 10. 验收标准

- `GET /api/products` 返回 `recentlyBoughtLabel` 和 `isBestSeller`
- 商品卡可见近期购买文案
- 指定商品显示 `Best seller`
- 推荐商品不应默认都显示 `Best seller`
- 不影响现有评分、配送、库存、购物车与筛选排序能力
