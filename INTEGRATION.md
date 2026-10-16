# 前端功能包 — 集成说明

基于 main 分支约 2026-10-16 16:00 PDT 的代码编写。共 8 个功能
（Pointz 5 个 + BikeButler 3 个），全部增量式，可直接覆盖。

## 安装

```bash
cd /path/to/Dahacks        # 仓库根目录
unzip ~/dahacks-frontend.zip  # 路径是 web/src/...，直接解压即放对位置
```

### 新增文件（6 个，不用动旧代码）

| 文件 | 功能 |
|---|---|
| `web/src/bikemap/route-utils.ts` | 纯函数：论文投票数学、haversine、turn-by-turn 生成（已单测） |
| `web/src/bikemap/tradeoff-card.tsx` | 量化对比卡片：Fastest vs Recommended + "+X min" chip + 绿化/风险对比 |
| `web/src/bikemap/preset-profiles.tsx` | 命名预设：🏙️ Fastest / ⚖️ Balanced / 🌾 Max nature 一键切换 |
| `web/src/bikemap/hazard-report.tsx` | Hazard 上报：地图点选 + 5 固定分类 + localStorage 持久化 |
| `web/src/bikemap/voice-nav.tsx` | Web Speech API 语音导航按钮 |
| `web/src/bikemap/segment-vote.tsx` | 路段 👍/👎 按钮（后端没合 patch 前自动隐藏） |

### 修改文件（6 个，完整替换版，已基于最新 main 写好）

| 文件 | 改动 |
|---|---|
| `web/src/bikemap/api.ts` | `Segment` += `features?`；`RouteRequest` += `pref_override?`（都是可选，向后兼容） |
| `web/src/bikemap/index.ts` | 导出新组件 |
| `web/src/bikemap/route-map.tsx` | + 旧路线淡显层（A/B 对比）+ Popup 里投票按钮 + hazard 图层/按钮 |
| `web/src/bikemap/map-page.tsx` | + `prefOverride`/`onVoteSegment` 可选 props + 旧路线追踪 |
| `web/src/pages/green-route.tsx` | 接入预设、投票、TradeoffCard、语音按钮 |
| `web/src/pages/safe-route.tsx` | stats 换成 TradeoffCard + 语音按钮 |

## 后端需要合的 patch（约 10 行，Track C / blar-tw 合入）

投票功能需要后端配合。不合的话：投票按钮自动隐藏，其他 7 个功能全部正常；
`pref_override` 发给旧后端会被 pydantic 直接忽略，不会报错。

**1. `py/app/bikemap/models.py`** —— 两个可选字段：

```python
# 加到 class Segment：
    features: dict[str, float] | None = Field(
        default=None,
        description="Per-feature 0..1 scores for this segment (for segment voting)",
    )

# 加到 class RouteRequest：
    pref_override: dict[str, float] | None = Field(
        default=None,
        description="Direct [-5,5] preference vector; overrides the rural-slider mapping when set",
    )
```

**2. `py/app/bikemap/engine.py`** —— 两处：

a) `build_preferences` 里，`return prefs, d_tol` 之前加：
```python
    if req.pref_override:
        for f, v in req.pref_override.items():
            if f in prefs:
                prefs[f] = max(-5.0, min(5.0, float(v)))
```

b) `_build_route` 里每个 segment 的构造处加 `features=`（各特征的
length-weighted 平均值，和 score 的加权方式一致）：
```python
# 在 per-segment 循环里、ssum/wsum 累加处附近加：
feat_sum: dict[str, float] = {}          # 循环外初始化
for f, fv in vec01.items():              # 循环内累加
    feat_sum[f] = feat_sum.get(f, 0.0) + fv * ln
# Segment(...) 构造时加：
features={f: round(feat_sum[f] / wsum, 3) for f in feat_sum} if wsum else None,
```

## 验证

- `npx tsc -p tsconfig.json`（即 `npm run typecheck`）应零报错
- 前端：拖 rural slider → 旧路线灰色淡显保留；点路段 Popup → 👍/👎（合 patch 后）
  投票 → 路线重算；右上角 "Report hazard" → 点地图 → 选分类保存；
  "Voice nav" → 浏览器朗读路线
- 注意：blar-tw 在 10-16 14:04 改过 engine/scoring，合 patch 时以 main 最新版为准

## 备注

- 旧的 `Stat` 对比行被 `TradeoffCard` 替代；green 页原来 `−null dB` 的噪音行
  现在只在后端返回非 null 时显示（诚实原则）。
