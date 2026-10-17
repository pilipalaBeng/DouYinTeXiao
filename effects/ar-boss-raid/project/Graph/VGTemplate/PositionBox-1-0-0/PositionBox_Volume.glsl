vec3 localRand3 = Rand3(seed) - 0.5f;

vec3 outPosSizeGreaterThanZero = max(Size.xyz, VFX_EPSILON) * localRand3;
vec3 planeBound = 0.5f * Size.xyz;
float top    = planeBound.z - outPosSizeGreaterThanZero.z;
float bottom = planeBound.z + outPosSizeGreaterThanZero.z;
float front  = planeBound.y - outPosSizeGreaterThanZero.y;
float back   = planeBound.y + outPosSizeGreaterThanZero.y;
float right  = planeBound.x - outPosSizeGreaterThanZero.x;
float left   = planeBound.x + outPosSizeGreaterThanZero.x;

vec3 outDir = vec3(0.0,0.0,1.0);
float min = top;
if (bottom < min) { outDir = vec3(0, 0,-1);  min = bottom; }
if (front  < min) { outDir = vec3(0, 1, 0);  min = front;  }
if (back   < min) { outDir = vec3(0,-1, 0);  min = back;   }
if (right  < min) { outDir = vec3(1, 0, 0);  min = right;  }
if (left   < min) { outDir = vec3(-1,0, 0);  min = left;   }
direction = outDir;
position = Size.xyz * localRand3 + Position.xyz;
