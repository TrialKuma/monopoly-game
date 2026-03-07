"""
Asset Cut - UI元素抠图脚本
从游戏截图中裁剪出各个UI元素，使用 rembg 去除背景，输出透明PNG

用法:
  python extract.py                           # 使用脚本内配置
  python extract.py --src 图片.png --task 任务名  # 命令行指定
  python extract.py --src 图片.png --task 任务名 --config config.json

输出目录:
  d:\AssetCut\output\<任务名>\  <- 矩形裁剪中间产物
  d:\AssetCut\final\<任务名>\   <- 去背景最终成品
"""
import os
import sys
import json
import argparse
from PIL import Image

# ============ 默认配置（可通过命令行覆盖） ============
DEFAULT_CONFIG = {
    "src": "",
    "task": "untitled",
    "elements": {}
}

BASE_DIR = r"d:\AssetCut"
WORK_DIR = os.path.join(BASE_DIR, "output")
FINAL_DIR = os.path.join(BASE_DIR, "final")


def crop_elements(img, elements, work_dir):
    """矩形裁剪所有元素"""
    os.makedirs(work_dir, exist_ok=True)
    w, h = img.size
    results = {}

    print(f"\n[1/2] 矩形裁剪 {len(elements)} 个元素...")
    for name, (l, t, r, b) in elements.items():
        box = (
            max(0, int(w * l)),
            max(0, int(h * t)),
            min(w, int(w * r)),
            min(h, int(h * b)),
        )
        cropped = img.crop(box)
        out_path = os.path.join(work_dir, f"{name}.png")
        cropped.save(out_path)
        results[name] = cropped
        print(f"  ✓ {name:20s} {cropped.size[0]:4d}x{cropped.size[1]:4d}  box={box}")

    return results


def remove_background(cropped_dict, final_dir):
    """使用 rembg 去背景"""
    os.makedirs(final_dir, exist_ok=True)

    print(f"\n[2/2] rembg 去背景 -> {final_dir}")
    try:
        from rembg import remove, new_session
        session = new_session("u2net")

        for name, cropped in cropped_dict.items():
            result = remove(cropped, session=session)
            out_path = os.path.join(final_dir, f"{name}.png")
            result.save(out_path)
            print(f"  ✓ {name}")

        print(f"\n✅ 全部完成! 共 {len(cropped_dict)} 个文件")
        print(f"   最终成品: {final_dir}")
    except Exception as e:
        print(f"\n⚠️ rembg 不可用 ({e})")
        print("   回退：保存矩形裁剪结果...")
        for name, cropped in cropped_dict.items():
            out_path = os.path.join(final_dir, f"{name}.png")
            cropped.save(out_path)
        print(f"   已保存到: {final_dir}")


def load_config(config_path):
    """从 JSON 文件加载配置"""
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="UI元素抠图工具")
    parser.add_argument("--src", help="源图片路径")
    parser.add_argument("--task", help="任务名称（用于输出子目录）")
    parser.add_argument("--config", help="JSON配置文件路径")
    args = parser.parse_args()

    # 加载配置
    if args.config:
        config = load_config(args.config)
    else:
        config = DEFAULT_CONFIG.copy()

    # 命令行参数覆盖
    if args.src:
        config["src"] = args.src
    if args.task:
        config["task"] = args.task

    src_img = config["src"]
    task_name = config["task"]
    elements = config.get("elements", {})

    # 将 elements value 从 list 转为 tuple（JSON不支持tuple）
    elements = {k: tuple(v) for k, v in elements.items()}

    if not src_img:
        print("❌ 请指定源图片路径: --src 图片.png")
        sys.exit(1)

    if not elements:
        print("❌ 未定义任何元素。请通过 --config 或修改脚本中的 DEFAULT_CONFIG")
        sys.exit(1)

    # 打开图片
    img = Image.open(src_img)
    w, h = img.size
    print(f"源图: {src_img}")
    print(f"尺寸: {w} x {h}")
    print(f"任务: {task_name}")

    work_dir = os.path.join(WORK_DIR, task_name)
    final_dir = os.path.join(FINAL_DIR, task_name)

    # 执行
    cropped = crop_elements(img, elements, work_dir)
    remove_background(cropped, final_dir)


if __name__ == "__main__":
    main()
