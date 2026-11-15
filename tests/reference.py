"""Independent eigenvalues by Sturm LDL inertia bisection, Python stdlib only.
Eigenvectors are independently checked by covariance reconstruction/eigen residual,
not matched across arbitrary eigenspace signs or repeated eigenvalues.
"""
import math,subprocess,os,decimal
D=decimal.Decimal;decimal.getcontext().prec=55
count=0;worst=0

def eq(a,b,tol=2e-8):
 global count,worst
 if b is None:assert math.isnan(a);count+=1;return
 b=float(b);e=abs(a-b)/max(1,abs(a),abs(b));count+=1;worst=max(worst,e);assert e<tol,(a,b,e)

def inertia(matrix,shift):
 n=len(matrix);l=[[D(0)]*n for _ in range(n)];d=[D(0)]*n
 for i in range(n):
  l[i][i]=D(1)
  d[i]=matrix[i][i]-shift-sum((l[i][k]**2*d[k] for k in range(i)),D(0))
  # Bisection points can land exactly on a pivot. Signed tiny perturbation is
  # far below bisection resolution and only avoids division by zero.
  if abs(d[i])<D('1e-70'):d[i]=D('-1e-70')
  for j in range(i+1,n):l[j][i]=(matrix[j][i]-sum((l[j][k]*l[i][k]*d[k]for k in range(i)),D(0)))/d[i]
 return sum(v<0 for v in d)

def spectrum(cov):
 a=[[D(str(v))for v in r]for r in cov];radius=max(sum(abs(z)for z in row)for row in a)+1;out=[]
 for index in range(6):
  lo=-radius;hi=radius
  for _ in range(170):
   mid=(lo+hi)/2
   if inertia(a,mid)<=index:lo=mid
   else:hi=mid
  out.append(float((lo+hi)/2))
 return list(reversed(out))

fixture=[[0.0]*6 for _ in range(6)]
for i in range(0,6,2):
 fixture[i][i]=fixture[i+1][i+1]=2+2*i
 fixture[i][i+1]=fixture[i+1][i]=1
for a,b in zip(spectrum(fixture),[11,9,7,5,3,1]):eq(a,b,1e-12)

for z in range(18):
 level=2+(z%6)*2;slope=1+z%8;curve=.5+z%6;ripple=.25+(z%12)/4;train=48 if z%2 else 72;keep=1+z%6;amplitudes=[level,slope,curve,.75*ripple,.5*ripple,.25*ripple];x=[]
 for t in range(1,97):
  row=[]
  for j in range(6):
   v=.05*(j-2.5)
   for k in range(6):
    basis=1/math.sqrt(6)if k==0 else math.sqrt(2/6)*math.cos(math.pi*k*(j+.5)/6);score=math.sin((.31+.23*k)*t+.4*k)+.35*math.cos((.13+.17*k)*t-.2*k);v+=amplitudes[k]*basis*score
   row.append(v)
  x.append(row)
 mean=[math.fsum(row[j]for row in x[:train])/train for j in range(6)];cov=[[math.fsum((row[j]-mean[j])*(row[k]-mean[k])for row in x[:train])/(train-1)for k in range(6)]for j in range(6)];values=spectrum(cov);vectors=[[0.]*6 for _ in range(6)];java_rows=[];stats=None
 text=subprocess.check_output([os.environ.get('JAVA','java'),'-cp','build/classes','Dump',str(level),str(slope),str(curve),str(ripple),str(train),str(keep)],text=True)
 for line in text.splitlines():
  tag,*v=line.split(',');v=list(map(float,v))
  if tag=='H':stats=v
  if tag=='E':
   j=int(v[0]);eq(v[1],values[j]);eq(v[2],values[j]/sum(values));eq(v[3],mean[j])
  if tag=='V':
   j,k=map(int,v[:2]);vectors[j][k]=v[2];eq(v[3],cov[j][k])
  if tag=='X':java_rows.append(v)
 for j in range(6):
  for k in range(6):
   eq(sum(vectors[r][j]*vectors[r][k]*values[r]for r in range(6)),cov[j][k]);eq(sum(cov[j][r]*vectors[k][r]for r in range(6)),values[k]*vectors[k][j]);eq(sum(vectors[j][r]*vectors[k][r]for r in range(6)),int(j==k))
 # Independent projector matrix, not the production repeated score contribution loop.
 projector=[[sum(vectors[k][i]*vectors[k][j]for k in range(keep))for j in range(6)]for i in range(6)];ss=hs=0;levels=[3+.2*math.log1p(t)for t in [.25,1,2,5,10,30]]
 for v in java_rows:
  i,j=map(int,v[:2]);actual=x[i][j];levels[j]+=actual/100;fitted=mean[j]+math.fsum(projector[j][r]*(x[i][r]-mean[r])for r in range(6));residual=actual-fitted;eq(v[2],actual);eq(v[3],levels[j]);eq(v[4],math.fsum(vectors[j][r]*(x[i][r]-mean[r])for r in range(6)));eq(v[5],fitted);eq(v[6],residual)
  if i<train:ss+=residual**2
  else:hs+=residual**2
 for a,b in zip(stats,[sum(values[:keep])/sum(values),math.sqrt(ss/(train*6)),math.sqrt(hs/((96-train)*6)),ss,hs]):eq(a,b)
print(f'{count} independent Python Sturm/LDL checks passed, max scaled {worst}')
