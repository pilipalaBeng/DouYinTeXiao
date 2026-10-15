# GAN

## 能力描述

对实时相机画面应用内置 GAN 预设效果，实现人物生成、形象变化和风格化表现。

## 适用场景

适合全身换装、真人搞怪、表情迁移、真人美化，以及“穿越漫画”等实时人物生成与风格化玩法。

## 能力边界

当前仅支持已有的 Loki GAN 预设，不支持启动 UGC GAN 训练、导入用户训练模型或动态调整 GAN 参数。

## 工具工作流

1. 调用 `ganEffect`，传入 `{ "operation": "list", "query": "<可选检索词>" }`，从返回结果中选择已验证的列表项；`name` 用作 `sceneOps.id`，`ganKey` 用作 `general.kind`。
2. 调用 `sceneOps` 新增预设：

```json
{
  "ops": [
    {
      "op": "add",
      "type": "General",
      "id": "<ganEffect 返回的 name>",
      "general": {
        "kind": "<ganEffect 返回的 ganKey>"
      }
    }
  ]
}
```

`ganEffect` 只提供预设列表，不执行场景写入。
