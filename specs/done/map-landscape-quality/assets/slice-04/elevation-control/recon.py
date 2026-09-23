import math,json
R=6371.;l0=math.radians(18);p0=math.radians(38)
def project(lon,lat):
 l,p=map(math.radians,[lon,lat]);k=R*math.sqrt(2/(1+math.sin(p0)*math.sin(p)+math.cos(p0)*math.cos(p)*math.cos(l-l0)))
 return k*math.cos(p)*math.sin(l-l0),k*(math.cos(p0)*math.sin(p)-math.sin(p0)*math.cos(p)*math.cos(l-l0))
def inverse(x,y):
 rho=math.hypot(x,y)
 if rho==0:return 18.,38.
 c=2*math.asin(rho/(2*R));p=math.asin(math.cos(c)*math.sin(p0)+y*math.sin(c)*math.cos(p0)/rho);l=l0+math.atan2(x*math.sin(c),rho*math.cos(p0)*math.cos(c)-y*math.sin(p0)*math.sin(c));return math.degrees(l),math.degrees(p)
def tile(l,p,z):return (l+180)/360*2**z,(1-math.asinh(math.tan(math.radians(p)))/math.pi)/2*2**z
out={};tiles=set();err=0
for name,(cx,cy) in {'alps':(-450,990),'italy':(-325,640)}.items():
 pts=[inverse(cx+dx,cy+dy) for dx in range(-368,369,8) for dy in range(-368,369,8)]
 for x in range(cx-368,cx+369,8):
  for y in range(cy-368,cy+369,8):
   xx,yy=project(*inverse(x,y));err=max(err,math.hypot(xx-x,yy-y))
 tt={tuple(map(math.floor,tile(*p,7))) for p in pts};tiles|=tt
 out[name]={'centerLonLat':inverse(cx,cy),'lonRange':[min(p[0]for p in pts),max(p[0]for p in pts)],'latRange':[min(p[1]for p in pts),max(p[1]for p in pts)],'z7Tiles':sorted(tt),'grid8kmBytesFloat32':93*93*4,'grid2kmBytesFloat32':369*369*4}
out['union']={'z':7,'tiles':sorted(tiles),'count':len(tiles),'roundtripMaxKm':err,'groundPixelKmAt45':2*math.pi*6378.137*math.cos(math.radians(45))/(128*256)}
print(json.dumps(out,indent=2))
