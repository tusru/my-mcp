const express = require('express');
const axios = require('axios');
const app = express();

// 自动处理 JSON 数据
app.use(express.json());

// 1. 握手与心跳逻辑 (解决 SSE 断连报错的关键)
app.get('/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write("data: {\"type\":\"connected\"}\n\n");

    // 每 15 秒发送一个注释行作为心跳，防止 VPN 或代理服务器认为连接超时
    const keepAlive = setInterval(() => {
        res.write(':\n\n'); 
    }, 15000);

    // 当 Omate 断开连接时，清除计时器
    req.on('close', () => {
        clearInterval(keepAlive);
    });
});

// 2. 核心搜图逻辑 (适配 Civitai API)
app.post('/sse', async (req, res) => {
    // 解析来自 Omate 的工具调用参数
    const { query, nsfw_level = "X" } = req.body.params?.arguments || {};
    
    try {
        // 设置 15 秒超长等待，确保 C 站响应慢时不会直接报错
        const url = `https://civitai.com/api/v1/images?query=${encodeURIComponent(query)}&limit=1&nsfw=${nsfw_level}`;
        const response = await axios.get(url, { timeout: 15000 });
        
        const item = response.data.items?.[0];

        if (!item) {
            return res.json({ content: [{ type: "text", text: "未找到相关图片，请换个词试试。" }] });
        }

        // 返回 Markdown 格式，让 Omate 直接出图
        res.json({
            content: [{
                type: "text",
                text: `![Image](${item.url})\n\n[提示词]: ${item.meta?.prompt || "无数据"}`
            }]
        });
    } catch (err) {
        // 捕获错误，不让服务器崩溃
        res.json({ content: [{ type: "text", text: "连接 C 站失败，可能是网络抖动，请重试。" }] });
    }
});

// 监听 Render 分配的端口
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`稳定版 MCP 服务器已在端口 ${PORT} 启动`);
});
