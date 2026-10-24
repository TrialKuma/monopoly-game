"""Compose rendered QA images only; no design-reference or model-image editing."""
from pathlib import Path
import argparse,json,hashlib
from PIL import Image,ImageDraw,ImageFont
def main():
    parser=argparse.ArgumentParser();parser.add_argument('report',type=Path);args=parser.parse_args()
    report=json.loads(args.report.read_text('utf-8'));candidate=Path(report['processedCandidate']['path'])
    if hashlib.sha256(candidate.read_bytes()).hexdigest()!=report['processedCandidate']['sha256']:raise ValueError('Candidate changed')
    paths=[('AI raw front',report['renderedSource']['views'][0]),('AI raw iso',report['renderedSource']['views'][1])]
    paths += [('LOD '+Path(path).stem[4:],path) for path in report['renderedCandidate']['views']]
    canvas=Image.new('RGB',(4*512,2*552+74),(224,228,232));draw=ImageDraw.Draw(canvas)
    try:font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',21)
    except OSError:font=ImageFont.load_default()
    title=f"{report['region']} / {report['asset']}  |  {report['triangles']:,} triangles  |  {report['processedCandidate']['bytes']:,} bytes"
    draw.text((18,10),title,fill=(20,25,32),font=font)
    draw.text((18,39),'Candidate SHA256: '+report['processedCandidate']['sha256'],fill=(20,25,32),font=font)
    sources=[]
    for i,(label,path) in enumerate(paths):
        source=Path(path);sources.append({'path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'label':label})
        x=(i%4)*512;y=(i//4)*552+74
        image=Image.open(path).convert('RGBA');canvas.paste(image,(x,y),image)
        draw.text((x+12,y+514),label,fill=(20,25,32),font=font)
    output=Path(report['renderedCandidate']['views'][0]).parent/'review-sheet.jpg';canvas.save(output,quality=94)
    report['reviewSheet']={'path':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,
                           'candidateSha256':report['processedCandidate']['sha256'],'sourceImages':sources,
                           'content':'Unmodified CPU render images composed with labels for visual comparison only'}
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(output)
if __name__=='__main__':main()
