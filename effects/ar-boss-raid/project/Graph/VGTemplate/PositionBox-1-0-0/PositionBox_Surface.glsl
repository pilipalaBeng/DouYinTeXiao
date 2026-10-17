float areaXY = max(Size.x * Size.y, VFX_EPSILON);
float areaXZ = max(Size.x * Size.z, VFX_EPSILON);
float areaYZ = max(Size.y * Size.z, VFX_EPSILON);

float face = Rand(seed) * (areaXY + areaXZ + areaYZ);
float flip = (Rand(seed) >= 0.5f) ? 0.5f : -0.5f;
vec3 cube = vec3(Rand2(seed) - 0.5f, flip);

vec3 outDir;
if (face < areaXY){
    cube = cube.xyz;
    outDir = vec3(0.0, 0.0, flip);
}else if(face < areaXY + areaXZ){
    cube = cube.xzy;
    outDir = vec3(0.0, flip, 0.0);
}else{
    cube = cube.zxy;
    outDir = vec3(flip, 0.0, 0.0);
}

direction = outDir;
position = cube * Size.xyz + Position.xyz;
