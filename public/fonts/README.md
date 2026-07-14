# 未来荧黑 Glow Sans SC

来源：https://github.com/welai/glow-sans （v0.93，SIL Open Font License 1.1，可免费商用）

原始 OTF 每字重约 7MB，此处用 fontTools 子集化为 woff2 自托管：

- 字符集：ASCII + GB2312 全部汉字/全角符号 + 常用标点箭头（约 7500 字符）
- 命令：`python3 -m fontTools.subset GlowSansSC-Normal-<W>.otf --text-file=subset-chars.txt --layout-features='*' --flavor=woff2 --desubroutinize`
- 子集外的生僻字（如个别玩家昵称）按 CSS 字体栈回落到 PingFang SC / 微软雅黑

字重对应：Regular→400，Bold→700，Heavy→900（500/600/800 由浏览器就近匹配）。
