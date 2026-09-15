import json,pathlib,urllib.request,concurrent.futures,hashlib
root=pathlib.Path(__file__).parent
items=json.loads((root/'tiles.json').read_text())
def fetch(item):
    version=item['headers'].get('x-amz-version-id')
    url=item['url']+('?versionId='+version if version else '')
    with urllib.request.urlopen(url,timeout=40) as response:
        data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:
        raise ValueError('Tile content differs from pinned input: '+item['url'])
    (root/f"{item['z']}-{item['x']}-{item['y']}.png").write_bytes(data)
    return len(data)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    sizes=list(pool.map(fetch,items))
print(json.dumps({'tiles':len(sizes),'bytes':sum(sizes)}))
