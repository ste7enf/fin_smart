#!/bin/bash

# 设置飞书机器人定时推送任务
# 每天上午8:00执行

echo "=========================================="
echo "设置飞书机器人定时推送任务"
echo "=========================================="

# 获取当前目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_SCRIPT="$SCRIPT_DIR/feishu-bot.js"

# 检查脚本是否存在
if [ ! -f "$BOT_SCRIPT" ]; then
    echo "错误: 找不到推送脚本 $BOT_SCRIPT"
    exit 1
fi

echo "推送脚本路径: $BOT_SCRIPT"

# 检查环境变量
if [ -z "$FEISHU_WEBHOOK_URL" ]; then
    echo ""
    echo "⚠️  警告: 未设置 FEISHU_WEBHOOK_URL 环境变量"
    echo "请先设置飞书机器人 webhook URL:"
    echo "export FEISHU_WEBHOOK_URL='https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx'"
    echo ""
    echo "你可以在 ~/.zshrc 或 ~/.bash_profile 中添加此环境变量"
    echo ""
fi

# 创建 cron 任务
# 每天上午8:00执行
CRON_JOB="0 8 * * * cd $SCRIPT_DIR && FEISHU_WEBHOOK_URL='$FEISHU_WEBHOOK_URL' /usr/local/bin/node $BOT_SCRIPT >> $SCRIPT_DIR/cron.log 2>&1"

# 检查是否已存在相同的 cron 任务
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -F "$BOT_SCRIPT" || true)

if [ -n "$EXISTING_CRON" ]; then
    echo "⚠️  已存在定时任务，正在更新..."
    # 删除旧任务
    crontab -l 2>/dev/null | grep -v -F "$BOT_SCRIPT" | crontab -
fi

# 添加新任务
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo ""
echo "✅ 定时任务设置成功！"
echo ""
echo "任务详情:"
echo "  执行时间: 每天上午 8:00"
echo "  执行脚本: $BOT_SCRIPT"
echo "  日志文件: $SCRIPT_DIR/cron.log"
echo ""
echo "当前 crontab 列表:"
crontab -l
echo ""
echo "=========================================="
echo "使用说明:"
echo "=========================================="
echo "1. 查看日志: tail -f $SCRIPT_DIR/cron.log"
echo "2. 手动测试: node $BOT_SCRIPT"
echo "3. 编辑定时任务: crontab -e"
echo "4. 删除定时任务: crontab -l | grep -v feishu-bot | crontab -"
echo ""
echo "注意: 请确保服务器在 8:00 时处于运行状态"
echo "=========================================="
