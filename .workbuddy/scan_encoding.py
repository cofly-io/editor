#!/usr/bin/env python3
"""扫描项目中的中文编码问题"""
import os
import sys
import re
from pathlib import Path

project_root = Path(r"D:\SourceCode\editor")
extensions = {'.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css', '.scss', '.less', '.vue', '.txt', '.xml', '.svg'}

# 跳过目录
skip_dirs = {'.git', 'node_modules', '.next', 'dist', '.turbo', '__pycache__', '.workbuddy'}
# 跳过大型第三方目录
skip_prefixes = ['articraft']

results = {
    'utf8_bom': [],       # UTF-8 BOM
    'utf16': [],          # UTF-16
    'non_utf8': [],       # 可能非 UTF-8
    'replacement_chars': [],  # U+FFFD 替换字符（明确乱码）
    'garbled_pattern': [],    # 疑似乱码模式
}

# 常见乱码特征字节（GBK 字节被 UTF-8 解码后的特征）
garbled_chars_pattern = re.compile(
    '[\u0100-\u024f]{4,}'  # 连续拉丁扩展字符（GBK 中文被误读的常见表现）
    '|[\ufffd]{2,}'         # 连续替换字符
)

def is_likely_utf8(data):
    """简单检查是否为有效 UTF-8"""
    try:
        data.decode('utf-8')
        return True
    except UnicodeDecodeError:
        return False

def check_file(filepath):
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
        if not data:
            return

        # 检查 BOM
        if data[:3] == b'\xef\xbb\xbf':
            results['utf8_bom'].append(str(filepath))
            data = data[3:]
        elif data[:2] == b'\xff\xfe':
            results['utf16'].append(str(filepath))
            try:
                text = data[2:].decode('utf-16-le')
                check_text(text, filepath)
            except:
                pass
            return
        elif data[:2] == b'\xfe\xff':
            results['utf16'].append(str(filepath))
            try:
                text = data[2:].decode('utf-16-be')
                check_text(text, filepath)
            except:
                pass
            return

        # 检查是否为有效 UTF-8
        if not is_likely_utf8(data):
            results['non_utf8'].append(str(filepath))
            return

        # 解码为 UTF-8 并检查内容
        try:
            text = data.decode('utf-8')
            check_text(text, filepath)
        except:
            pass

    except (PermissionError, OSError) as e:
        pass

def check_text(text, filepath):
    """检查解码后的文本"""
    filepath_str = str(filepath)

    # 检查替换字符 U+FFFD
    fffd_count = text.count('\ufffd')
    if fffd_count >= 2:
        results['replacement_chars'].append(f"{filepath_str} ({fffd_count} U+FFFD)")
        return

    # 检查疑似乱码模式
    matches = garbled_chars_pattern.findall(text)
    if matches:
        results['garbled_pattern'].append(f"{filepath_str} ({len(matches)} suspicious regions)")

def main():
    total = 0
    scanned = 0

    for root, dirs, files in os.walk(project_root):
        # 过滤目录
        dirs[:] = [d for d in dirs if d not in skip_dirs and not any(d.startswith(p) for p in skip_prefixes)]

        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in extensions:
                total += 1
                fp = os.path.join(root, f)
                check_file(fp)
                scanned += 1
                if scanned % 500 == 0:
                    print(f"  已扫描 {scanned} 个文件...", file=sys.stderr)

    print(f"\n总共扫描 {scanned}/{total} 个文件\n")

    # 输出结果
    any_issue = False

    if results['utf8_bom']:
        any_issue = True
        print(f"=== UTF-8 BOM 文件 ({len(results['utf8_bom'])} 个) ===")
        print("（BOM 在某些工具中可能引起问题）")
        for f in results['utf8_bom'][:20]:
            print(f"  {f}")
        if len(results['utf8_bom']) > 20:
            print(f"  ... 还有 {len(results['utf8_bom']) - 20} 个")
        print()

    if results['utf16']:
        any_issue = True
        print(f"=== UTF-16 文件 ({len(results['utf16'])} 个) ===")
        for f in results['utf16']:
            print(f"  {f}")
        print()

    if results['non_utf8']:
        any_issue = True
        print(f"=== 非 UTF-8 编码文件 ({len(results['non_utf8'])} 个) ===")
        print("（这些文件可能使用 GBK/GB2312 等编码，容易导致乱码）")
        for f in results['non_utf8']:
            print(f"  {f}")
        print()

    if results['replacement_chars']:
        any_issue = True
        print(f"=== 含 U+FFFD 替换字符（明确乱码）({len(results['replacement_chars'])} 个) ===")
        for f in results['replacement_chars'][:30]:
            print(f"  {f}")
        if len(results['replacement_chars']) > 30:
            print(f"  ... 还有 {len(results['replacement_chars']) - 30} 个")
        print()

    if results['garbled_pattern']:
        any_issue = True
        print(f"=== 疑似乱码模式 ({len(results['garbled_pattern'])} 个) ===")
        for f in results['garbled_pattern'][:30]:
            print(f"  {f}")
        if len(results['garbled_pattern']) > 30:
            print(f"  ... 还有 {len(results['garbled_pattern']) - 30} 个")
        print()

    if not any_issue:
        print("未发现明显的编码问题！")

if __name__ == '__main__':
    main()
