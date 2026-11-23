---
title: CUDA的开发流程
description: GPU 并行原理 & GEMM 优化实例
category: tech
date: 2026-11-23
tags: [博客, Markdown, GitHub Pages]
visibility: public
---

### 异构结构

![CPU 与 GPU 异构计算以及 CUDA Grid、Block、Thread 的关系](../../assets/posts/gemm/cuda-heterogeneous-computing.webp)

+ `Grid` : 整个 `GPU` 执行的一次任务被称为一个 `Grid`。

+ `Block` : 一个 `Grid` 被划分为多个 `Block`。同一个 `Block` 会被分配到同一个 `SM` (流式多处理器) 上执行。

+ `Thread` : `Block` 内部又包含了多个 `Thread`。

+ `Global Memory` : 在最底下。它是 `GPU`上容量最大、但速度最慢的内存; 所有 `Block` 里的所有 `Thread` 都能访问它。`CPU` 拷过来的数据第一站就存在这里。

+ `Shared Memory` : 在 `Block` 内部。它是芯片上的缓存，容量很小，但速度极快（接近寄存器）。只有同一个 `Block` 内部的 `Thread` 才能访问这块内存。

2. `GPU` 内存层次结构

![GPU 内存层次图，展示各 SM 的寄存器、共享内存与全局内存](../../assets/posts/gemm/gpu-memory-hierarchy.webp)


***
### `cuda` 矩阵乘法优化

#### `GEMMv1`

```cuda
#include <cuda.h>
#include <stdio.h>
#include <random>
#include <time.h>
#include <sys/time.h>
 
double cpuSecond()
{
    struct timeval tp;
    gettimeofday(&tp, NULL);
    return((double)tp.tv_sec + (double)tp.tv_usec * 1e-6);
}
 
//一定要一个 void 返回值
__global__ void MatMul_Device(double *A , double *B , double *C ,int n,int m,int q) {
    int col = blockDim.x * blockIdx.x + threadIdx.x;
    int row = blockDim.y * blockIdx.y + threadIdx.y;
    if (col < n && row < q) {
        double sum = 0.0;
        for (int k = 0 ; k < m ; ++k) {
            sum += A[col * m + k] * B[k * q + row]; //千万不要 c += , 这相当于一次访存。
        }
        C[col * q + row] = sum;
    }
}
void MatMul_Host(double *A , double *B , double *C ,int n,int m,int q) {
    for (int i = 0 ; i < n ; ++i) {
        for (int j = 0 ; j < q ; ++j) {
            double sum = 0.0;
            for (int k = 0 ; k < m ; ++k) {
                sum += A[i * m + k] * B[k * q + j]; 
            }
            C[i * q + j] = sum;
        }
    }
}
void CheckResult(double *host , double *device , int N) {
    double eps = 1.0E-4;
    for (int i = 0 ; i < N ; ++i) {
        if (fabs(host[i] - device[i]) > eps) {
            printf("Results don\'t match!\n");
            printf("%f(host[%d] )!= %f(gpu[%d])\n", host[i], i, device[i], i);
            return;
        }
    }
    printf("Check result success!\n");
}
void initMatrix(double *arr, int size) {
    
    std::random_device rd;  
    std::mt19937 gen(rd()); 
    //[-1 , 1] , 怕爆精度
    std::uniform_real_distribution<double> dis(-1.0f, 1.0f); 
    for (int i = 0; i < size; ++i) {
        arr[i] = dis(gen);
    }
}
 
int main() {
 
    double start, finish;
    srand(time(NULL));
 
    //A(n,m),B(m,q),C(n,q);
    int n = 2048 , m = 2048 , q = 512;
    const int sizeA = n * m ; 
    const int sizeB = m * q ;
    const int sizeC = n * q ;
    const int bytesA = sizeA * sizeof(double);
    const int bytesB = sizeB * sizeof(double);
    const int bytesC = sizeC * sizeof(double);
 
    double *host_A,*host_B,*host_C;
    host_A = (double*)malloc(bytesA);
    host_B = (double*)malloc(bytesB);
    host_C = (double*)malloc(bytesC);
 
    //记得先取值 &
    double *device_A,*device_B,*device_C;
    cudaMalloc((void**)&device_A , bytesA);
    cudaMalloc((void**)&device_B , bytesB);
    cudaMalloc((void**)&device_C , bytesC);
    
    //初始化
    initMatrix(host_A , sizeA);
    initMatrix(host_B , sizeB);
 
    //CPU start
    start = cpuSecond();
    MatMul_Host(host_A , host_B , host_C , n , m , q);
    finish = cpuSecond();
    double t = finish - start;
    printf("CPU %lf s\n", t);
    
    //GPU parallel start
    start = cpuSecond();
    cudaMemcpy(device_A , host_A , bytesA, cudaMemcpyHostToDevice);
    cudaMemcpy(device_B , host_B , bytesB, cudaMemcpyHostToDevice);
 
    int block_size = 16;
    dim3 block(block_size , block_size); //16 * 16 = 256
    dim3 grid((n + block.x - 1) / block.x , (q + block.y - 1) / block.y);
    
    MatMul_Device<<<grid , block>>>(device_A , device_B , device_C , n , m , q);
    cudaDeviceSynchronize();  
    finish = cpuSecond();
    t = finish - start;
    printf("GPU %lf s\n", t);
 
    double *result_from_gpu;
    result_from_gpu = (double*)malloc(bytesC);
    cudaMemcpy(result_from_gpu , device_C , bytesC , cudaMemcpyDeviceToHost);
    
    //检查结果
    CheckResult(host_C , result_from_gpu , sizeC);
 
    //释放内存
    cudaFree(device_A);
    cudaFree(device_B);
    cudaFree(device_C);
 
    free(host_A);
    free(host_B);
    free(host_C);
    free(result_from_gpu);
 
    return 0;
}
```
+ 坑点：

    + 把 `size` 和 `bytes` 混合得用

    + `__global__` 函数得返类型一定要写 `void` , 用之前一定要 `<<<grid,block>>>` 初始化

    + `cudaMemcpy` 有四个参数，最后一个是数据拷贝的方向

    + `float*` 不是 `*float` , `void**` 同理

    + `+=` 用临时变量存，不然访存多次

    + `cudaMemcpy` 默认是同步的（阻塞的），而核函数 `<<<...>>>` 默认是异步的，所以为了算 `GPU` 运行时间必须要加上 `cudaDeviceSynchronize()`

+ 测试时间对比 

![GEMMv1 的 CPU 与 GPU 运行时间和正确性检验结果](../../assets/posts/gemm/gemmv1-benchmark.webp)

***

#### `GEMMv2`

1. 思考

![GEMMv2 中同一线程块的多个线程重复读取矩阵 B 的一列](../../assets/posts/gemm/gemmv2-repeated-global-reads.webp)

![GEMMv2 将矩阵 A 和 B 的一部分载入共享内存](../../assets/posts/gemm/gemmv2-shared-memory.webp)

+ 半成品

```cuda
// 假设 BLOCK_DIM_x = 3, BLOCK_DIM_y = 3, K = 6
// 注意：这里的行列映射老师写的是 row=x, col=y (这会导致合并访存变差，通常我们写 row=y, col=x)

int row = threadIdx.x + blockIdx.x * blockDim.x;
int col = threadIdx.y + blockIdx.y * blockDim.y;
float tmp = 0;

// 申请共享内存，直接把 K=6 整个维度装进去（如果 K 是 4096，这里直接内存溢出崩溃）
__shared__ float SA[3][6]; 
__shared__ float SB[6][3];

// 1. 搬运矩阵 A 的当前行到 SA 中
// 因为 K=6，而线程块在 y 方向只有 3 个线程，所以需要循环搬运 (步长为 3)
for (int id = threadIdx.y; id < 6; id += 3)
{
    SA[threadIdx.x][id] = dA[row][id];
}

// 2. 搬运矩阵 B 的当前列到 SB 中
// 同理，x 方向只有 3 个线程，循环搬运 (步长为 3)
for (int id = threadIdx.x; id < 6; id += 3)
{
    SB[id][threadIdx.y] = dB[id][col];
}

// ⚠️ 极其致命的缺失：这里必须要有 __syncthreads(); ！！！
// 老师的伪代码里漏掉了，如果不加，下面的计算会读到全是 0 的垃圾数据。

// 3. 极速计算：直接从 Shared Memory 中读取数据进行乘加
for (int s = 0; s < 6; s++)
{
    tmp += SA[threadIdx.x][s] * SB[s][threadIdx.y];
}

// 4. 写回 Global Memory
dC[row * N + col] = tmp;
```

+ 关注 `SA[3][6]` 和 `SB[6][3]` , 为什么是 `3`？为什么是 `6`?

    + `3` : `threadIdx.x` 和 `threadIdx.y`, 就是块内偏移

    + `6` : `k = 6` 的原因。（`M`,`N`,`K` 矩阵 , `a[M][K]` , `b[K][N]`）

+ `id = threadIdx.y` 和 `id = threadIdx.x` (`for` 的开头) , 以及为什么步长为 `3`. （一定要有并行的想法）

![三个线程按不同起点和相同步长协作搬运数据](../../assets/posts/gemm/gemmv2-thread-copy-steps.webp)

+ `__shared__` 变量定义在 `__global__` 里面，毕竟每次都针对一个线程,有没有反复定义的嫌疑 ?

```cuda
#define BLOCK_SIZE 16

__global__ void matrixMul(float* A, float* B, float* C) {
    // 直接定义在 kernel 内部
    __shared__ float SA[BLOCK_SIZE][BLOCK_SIZE];
    __shared__ float SB[BLOCK_SIZE][BLOCK_SIZE];
    
    // ... 后面的逻辑 ...
}
```

![CUDA 为同一线程块的共享数组分配一次内存](../../assets/posts/gemm/gemmv2-shared-array-allocation.webp)

+ 这里 `6` 很小，但是 `K` 是可以很大的，这里就有可能爆 `Shared Memory`。 `3` 是线程块单方向长度，所以不会很大。所以这是半成品.

+ 直观感受代价

![直接读全局内存与通过共享内存读数据的成本对比](../../assets/posts/gemm/gemmv2-memory-read-comparison.webp)

+ 针对 `k` 过大的问题 , 采用 `分块矩阵乘法` 的思想

![沿 K 维分段进行矩阵乘法，将每段数据载入共享内存](../../assets/posts/gemm/gemmv2-tiled-multiplication.webp)

+ `__syncthreads();` ：强制同一个 `Block` 内的所有线程在这里集合。跑得快的线程必须停下来等，直到这个 `Block` 里的所有线程都到达了这个位置，大家才能一起往下执行。

+ 代码实现

```cuda
#include <cuda.h>
#include <stdio.h>
#include <random>
#include <time.h>
#include <sys/time.h>

const int Block_Dim = 16; 

double cpuSecond()
{
    struct timeval tp;
    gettimeofday(&tp, NULL);
    return((double)tp.tv_sec + (double)tp.tv_usec * 1e-6);
}
 
//一定要一个 void 返回值
__global__ void MatMul_Device(double *A , double *B , double *C ,int n,int m,int q) {
    int col = blockDim.x * blockIdx.x + threadIdx.x;
    int row = blockDim.y * blockIdx.y + threadIdx.y;
    __shared__ double SA[Block_Dim][Block_Dim];
    __shared__ double SB[Block_Dim][Block_Dim];
    double sum = 0.0;
    int width = (m + Block_Dim - 1) / Block_Dim;
    // (n,q)
    for (int i = 0 ; i < width ; ++i) {
        //SA
        if (col < n && i * Block_Dim + threadIdx.y < m) {
            SA[threadIdx.x][threadIdx.y] = A[col * m + threadIdx.y + i * Block_Dim];
        } else {
            SA[threadIdx.x][threadIdx.y] = double(0);
        }
        //SB
        if (i * Block_Dim + threadIdx.x < m && row < q) {
            SB[threadIdx.x][threadIdx.y] = B[(i * Block_Dim + threadIdx.x) * q + row];
        } else {
            SB[threadIdx.x][threadIdx.y] = double(0);
        }
        __syncthreads();
        for (int j = 0 ; j < Block_Dim ; ++j) {
            sum += SA[threadIdx.x][j] * SB[j][threadIdx.y];
        }
        __syncthreads();
    }
    if (col < n && row < q) {
        C[col * q + row] = sum;
    }
}
void MatMul_Host(double *A , double *B , double *C ,int n,int m,int q) {
    for (int i = 0 ; i < n ; ++i) {
        for (int j = 0 ; j < q ; ++j) {
            double sum = 0.0;
            for (int k = 0 ; k < m ; ++k) {
                sum += A[i * m + k] * B[k * q + j]; 
            }
            C[i * q + j] = sum;
        }
    }
}
void CheckResult(double *host , double *device , int N) {
    double eps = 1.0E-4;
    for (int i = 0 ; i < N ; ++i) {
        if (fabs(host[i] - device[i]) > eps) {
            printf("Results don\'t match!\n");
            printf("%f(host[%d] )!= %f(gpu[%d])\n", host[i], i, device[i], i);
            return;
        }
    }
    printf("Check result success!\n");
}
void initMatrix(double *arr, int size) {
    
    std::random_device rd;  
    std::mt19937 gen(rd()); 
    //[-1 , 1] , 怕爆精度
    std::uniform_real_distribution<double> dis(-1.0f, 1.0f); 
    for (int i = 0; i < size; ++i) {
        arr[i] = dis(gen);
    }
}
 
int main() {
 
    double start, finish;
    srand(time(NULL));
 
    //A(n,m),B(m,q),C(n,q);
    int n = 2048 , m = 2048 , q = 512;
    const int sizeA = n * m ; 
    const int sizeB = m * q ;
    const int sizeC = n * q ;
    const int bytesA = sizeA * sizeof(double);
    const int bytesB = sizeB * sizeof(double);
    const int bytesC = sizeC * sizeof(double);
 
    double *host_A,*host_B,*host_C;
    host_A = (double*)malloc(bytesA);
    host_B = (double*)malloc(bytesB);
    host_C = (double*)malloc(bytesC);
 
    //记得先取值 &
    double *device_A,*device_B,*device_C;
    cudaMalloc((void**)&device_A , bytesA);
    cudaMalloc((void**)&device_B , bytesB);
    cudaMalloc((void**)&device_C , bytesC);
    
    //初始化
    initMatrix(host_A , sizeA);
    initMatrix(host_B , sizeB);
 
    //CPU start
    start = cpuSecond();
    MatMul_Host(host_A , host_B , host_C , n , m , q);
    finish = cpuSecond();
    double t = finish - start;
    printf("CPU %lf s\n", t);
    
    //GPU parallel start
    start = cpuSecond();
    cudaMemcpy(device_A , host_A , bytesA, cudaMemcpyHostToDevice);
    cudaMemcpy(device_B , host_B , bytesB, cudaMemcpyHostToDevice);
 
    dim3 block(Block_Dim , Block_Dim); //16 * 16 = 256
    dim3 grid((n + block.x - 1) / block.x , (q + block.y - 1) / block.y);
    
    MatMul_Device<<<grid , block>>>(device_A , device_B , device_C , n , m , q);
    cudaDeviceSynchronize();  
    finish = cpuSecond();
    t = finish - start;
    printf("GPU %lf s\n", t);
 
    double *result_from_gpu;
    result_from_gpu = (double*)malloc(bytesC);
    cudaMemcpy(result_from_gpu , device_C , bytesC , cudaMemcpyDeviceToHost);
    
 
    //检查结果
    CheckResult(host_C , result_from_gpu , sizeC);
 
    //释放内存
    cudaFree(device_A);
    cudaFree(device_B);
    cudaFree(device_C);
 
    free(host_A);
    free(host_B);
    free(host_C);
    free(result_from_gpu);
 
    return 0;
}
```

+ 最本质的理解,`threadIdx.x` 和 `threadIdx.y` 确定后，就是要那一行和一列 , 长(广泛的 `k` ，这里的 `m`), 但太大了，只能分段取，再分段加

+ 这个时候就要 `__syncthreads();` 控制同步

![GEMMv2 的 CPU 与 GPU 运行时间和正确性检验结果](../../assets/posts/gemm/gemmv2-benchmark.webp)

***
#### `GEMMv3`

+ 对于 `v2` 版本，`1` 个线程负责 `C` 矩阵的 `1` 个点。为了算这 `1` 个点，每次循环都要去 `Shared Memory` 里读 `2` 个数

+ 对于 `v3` 版本，`1` 个线程负责 `C` 矩阵的一个 `TM * TN` 的小块

+ 为什么快？中间计算结果，可以全部放在 `register` 里面 (线程和 `register` 一一对应的)

![GEMMv3 中一个线程计算多个输出元素的布局](../../assets/posts/gemm/gemmv3-per-thread-accumulation.webp)

+ `v1` 版本

    + 代码

    ```cuda
    __global__ void MatMul_Device_v1(float *A, float *B , float *C , int n,int m,int q) {
        int i_begin = TM * (threadIdx.x + blockDim.x * blockIdx.x);
        int j_begin = TN * (threadIdx.y + blockDim.y * blockIdx.y);
        float tmp[TM][TN] = {0.0f}; //这里是申请寄存器空间
        for (int i_offset = 0 ; i_offset < TM ; ++i_offset) {
            for (int j_offset = 0 ; j_offset < TN ; ++j_offset) {
                int i = i_begin + i_offset , j = j_begin + j_offset; //矩阵实际坐标
                if (i < n && j < q) {
                    for (int k = 0 ; k < m ; ++k) {
                        tmp[i_offset][j_offset] += A[i * m + k] * B[k * q + j]; 
                    }
                }
            }
        }
        //存回去
        for (int i_offset = 0 ; i_offset < TM ; ++i_offset) {
            for (int j_offset = 0 ; j_offset < TN ; ++j_offset) {
                int i = i_begin + i_offset , j = j_begin + j_offset; //矩阵实际坐标
                if (i < n && j < q) {
                    C[i * q + j] = tmp[i_offset][j_offset];
                }
            }
        }
    }
    ```
    + 思想: 就是一个线程对应一个 `TM * TN` 的方块

    + 注意：线程和块不是一对一的关系，那 `blockDim.x` 和 `blockDim.y` 要对应变小

        ```cuda
        dim3 block(Block_Dim , Block_Dim); //16 * 16 = 256
        //注意一对多，grid大小肯定要修改
        int block_cover_x = TM * block.x;
        int block_cover_y = TN * block.y;
        dim3 grid((n + block_cover_x - 1) / block_cover_x , (q + block_cover_y - 1) / block_cover_y);
        ```

+ 观察

    + `tmp[][] += ` 避免了全局写问题，之前要写入回去 ，但这里感觉用一个中间变量存储，在循环结束的时候再写入 `C` 是一样的

    + 看这段：

        ```cuda
        for (int j_offset = 0; j_offset < TN; ++j_offset) {
            for (int k = 0; k < m; ++k) {
                tmp[i_offset][j_offset] += A[i * m + k] * B[k * q + j];
                //                          ↑ 这个 A[i*m+k] 跟 j_offset 无关！
            }
        }
        ```

        + 固定 `i_offset` ，遍历 `j_offset = 0~7` ，每次内层 `k` 循环都重新读了 `A[i*m+k]` —— 同一个 `A` 元素被读了 `k` 遍

        + `threadIdx.y` 不同的线程，处理的是同一行 `A` 的不同列 `B`，它们读的 `A` 完全一样。但 `GPU` 不知道，所以 `A` 被 `16` 个线程各读了一遍 → 总共重复读 `16×k` 倍

        + 这就是 `GEMMv2`, 放入共享内存

+ `v2` 版本

```cuda
__global__ void MatMul_Device_v2(float *A , float *B , float *C ,int n,int m,int q) {
    __shared__ float SA[BM][BK]; //BM 维度给每一线程x开了 TM 空间
    __shared__ float SB[BK][BN];
    float tmp[TM][TN] = {0.0f};
    int width = (m + BK - 1) / BK;
    int indX = (threadIdx.x + blockIdx.x * blockDim.x) * TM;
    int indY = (threadIdx.y + blockIdx.y * blockDim.y) * TN;
    for (int i = 0 ; i < width ; ++i) {
        //写入 SA
        for (int X_offset = 0 ; X_offset < TM ; ++X_offset) {
            int nowX = indX + X_offset;
            for (int K_offset = 0 ; K_offset < BK ; ++K_offset) {
                int nowK = i * BK + K_offset;
                if (nowX < n && nowK < m) {
                    SA[threadIdx.x * TM + X_offset][K_offset] = A[nowX * m + nowK];
                } else {
                    SA[threadIdx.x * TM + X_offset][K_offset] = 0.0;
                }
            }
        }
        //__syncthread(); 这里不用加
        //写入SB
        for (int Y_offset = 0 ; Y_offset < TN ; ++Y_offset) {
            int nowY = indY + Y_offset;
            for (int K_offset = 0 ; K_offset < BK ; ++K_offset) {
                int nowK = i * BK + K_offset;
                if (nowK < m && nowY < q) {
                    SB[K_offset][threadIdx.y * TN + Y_offset] = B[nowK * q + nowY];
                } else {
                    SB[K_offset][threadIdx.y * TN + Y_offset] = 0.0;
                }
            }
        }
        __syncthreads();
        //写入 tmp
        for (int k = 0 ; k < BK ; ++k) { //k 放在循环最外层，是一个隐藏的优化，因为最后一层 k 固定，我们可以提前把 SA,SB 从 Share Memery 提到 register里来
            /*
            float reg_A[TM];
            float reg_B[TN];
            for (int x = 0; x < TM; ++x) reg_A[x] = SA[threadIdx.x * TM + x][k];
            for (int y = 0; y < TN; ++y) reg_B[y] = SB[k][threadIdx.y * TN + y];
            */
            for (int x = 0 ; x < TM ; ++x) {
                for (int y = 0 ; y < TN ; ++y) {
                    tmp[x][y] += SA[threadIdx.x * TM + x][k] * SB[k][threadIdx.y * TN + y];
                    //tmp[x][y] += reg_A[x] * reg_B[y];
                }
            }
        }
        __syncthreads();
    }
    //写回C
    for (int x = 0 ; x < TM ; ++x) {
        for (int y = 0 ; y < TN ; ++y) {
            if (indX + x < n && indY + y < q) {
                C[(indX + x) * q + indY + y] = tmp[x][y];
            }
        }
    }
}
```
+ 把 `GEMMv2` 和 `GEMMv3-v1` 结合起来了

+ 每一个线程管 `TM * TN` 块 + 分块叠加

+ 思考 : `DEMMv2` 写的代码中分块长度设的是 `BlockDim` , 为什么这个设的就是 `BK=8` ? ，前者可以设置为 `8` 吗？

![早期线程协作搬运实现中，K 方向的分块步长和线程块宽度的关系](../../assets/posts/gemm/gemmv3-v1-tile-width.webp)

![利用每线程多元素分块独立选取 BK 的说明](../../assets/posts/gemm/gemmv3-independent-bk.webp)

![较大的 BK 对共享内存用量和占用率的影响](../../assets/posts/gemm/gemmv3-bk-memory-tradeoff.webp)

+ 思考 : 那感觉`GEMMv3` 的搬运效率没有 `GEMMv2` 高了,拿 `SA` 举例, `threadIdx.x` 工作都有 `threadIdx.y` 并行协作，而 `GEMMv3` 写的是变量 `K_offset`

```cuda
 //SA
if (col < n && i * Block_Dim + threadIdx.y < m) {
    SA[threadIdx.x][threadIdx.y] = A[col * m + threadIdx.y + i * Block_Dim];
} else {
    SA[threadIdx.x][threadIdx.y] = double(0);
}

  //写入 SA
for (int X_offset = 0 ; X_offset < TM ; ++X_offset) {
    int nowX = indX + X_offset;
    for (int K_offset = 0 ; K_offset < BK ; ++K_offset) {
        int nowK = i * BK + K_offset;
        if (nowX < n && nowK < m) {
            SA[threadIdx.x * TM + X_offset][K_offset] = A[nowX * m + nowK];
        } else {
            SA[threadIdx.x * TM + X_offset][K_offset] = 0.0;
        }
    }
}
```
![矩阵 A 的共享内存搬运代码和重复读写分析](../../assets/posts/gemm/gemmv3-sa-copy-loop.webp)

![两个不同 CUDA 线程对同一共享内存位置执行重复搬运的例子](../../assets/posts/gemm/gemmv3-redundant-threads.webp)

![早期实现中不同 CUDA 线程协作搬运不同矩阵元素的例子](../../assets/posts/gemm/gemmv3-collaborative-threads.webp)

总结 : 冗余不是发生在一个线程内部，而是发生在多个线程执行同一段没有区分度的代码时。在写 `CUDA` 算子时，永远要问自己一个问题：“当不同的线程运行到这一行时，它们算出来的内存地址是一样的吗？” 如果是一样的，那就是在做无用功！

+ 所以引出 `GEMMv4` 版本 -- 重排索引

***
#### `GEMMv4`

+ 代码

```cuda
#include <cuda.h>
#include <stdio.h>
#include <random>
#include <time.h>
#include <sys/time.h>

const int n = 2048 , m = 2048 , q = 512;
const int sizeA = n * m ; 
const int sizeB = m * q ;
const int sizeC = n * q ;
const int bytesA = sizeA * sizeof(float);
const int bytesB = sizeB * sizeof(float);
const int bytesC = sizeC * sizeof(float);

//blockDim.x = blockDim.y
const int Block_Dim = 32; 
const int TM = 4;
const int TN = 4;
const int BM = TM * Block_Dim;
const int BN = TN * Block_Dim;
const int BK = 8;

double cpuSecond()
{
    struct timeval tp;
    gettimeofday(&tp, NULL);
    return((double)tp.tv_sec + (double)tp.tv_usec * 1e-6);
}
 
__global__ void MatMul_Device(float *A , float *B , float *C ,int n,int m,int q) {
    __shared__ float SA[BM][BK];
    __shared__ float SB[BK][BN];
    float tmp[TM][TN] = {0.0f};
    //[threadIdx.x][threadIdx.y]，但注意行优先的原理
    int idx = threadIdx.x + blockDim.x * threadIdx.y;
    //SA[128][8] , SB[8][128] , 128 * 8 = 32 * 32;
    int rowA = idx % 128 , colA = idx / 128;
    int rowB = idx % 8 , colB = idx / 8;
    int width = (m + BK - 1) / BK; // [n , m] * [m , q]
    //int indA = TM * (threadIdx.x + blockDim.x * blockIdx.x);
    //int indB = TN * (threadIdx.y + blockDim.y * blockIdx.y);
    //indA,indB注释是易错，第一次写错了，这里对象不是单个线程去搬运了，把 threadIdx.x 和 threadIdx.y 去除。
    //协同搬运，所以 indA 的含义变了：它变成了**整个 Block（工程队）**在全局矩阵 A 中的起始行号（包工头的基准线）。
    int indA = TM * (blockDim.x * blockIdx.x);
    int indB = TN * (blockDim.y * blockIdx.y);
    float reg_A[TM] = {0.0f};
    float reg_B[TN] = {0.0f};
    
    for (int i = 0 ; i < width ; ++i) {
        //rowA 已经规定拿哪一行了
        if (indA + rowA < n && i * BK + colA < m) {
            SA[rowA][colA] = A[(indA + rowA) * m + i * BK + colA]; //A[indA + rowA][i * BK + colA]
        } else {
            SA[rowA][colA] = 0.0;
        }
        //SB[rowB][colB] , B[i * BK + rowB][indB + colB]
        if (i * BK + rowB < m && indB + colB < q) {
            SB[rowB][colB] = B[(i * BK + rowB) * q + indB + colB];
        } else {
            SB[rowB][colB] = 0.0;
        }
        __syncthreads();
        
        //计算放入寄存器，这个线程归位了，用 32 * 32 线程计算 C[128][128] , 每个计算 TM * TN (4 * 4) 个
        for (int k = 0 ; k < BK ; ++k) {
             // 2. 先把当前 k 需要的 A 和 B 的数据，从 Shared Memory 读到寄存器里！
            // for (int r = 0; r < TM; ++r) {
            //     reg_A[r] = SA[threadIdx.x * TM + r][k];
            // }
            // for (int c = 0; c < TN; ++c) {
            //     reg_B[c] = SB[k][threadIdx.y * TN + c];
            // }
            for (int r = 0 ; r < TM ; ++r) {
                for (int c = 0 ; c < TN ; ++c) {
                    tmp[r][c] += SA[threadIdx.x * TM + r][k] * SB[k][threadIdx.y * TN + c]; 
                    //tmp[r][c] += reg_A[r] * reg_B[c]; 
                }
            }
        }
        __syncthreads();
    }

    //写回 tmp[TM][TN] , 线程 32 * 32
    for (int r = 0 ; r < TM ; ++r) {
        for (int c = 0 ; c < TN ; ++c) {
            int reg_r = threadIdx.x * TM + r; //indA 换到最原始的定义 int indA = TM * (blockDim.x * blockIdx.x + threadIdx.x);
            int reg_c = threadIdx.y * TN + c;
            if (reg_r + indA < n && reg_c + indB < q) {
                C[(reg_r + indA) * q + reg_c + indB] = tmp[r][c];
            }
        }
    }
}

void MatMul_Host(float *A , float *B , float *C ,int n,int m,int q) {
    for (int i = 0 ; i < n ; ++i) {
        for (int j = 0 ; j < q ; ++j) {
            float sum = 0.0;
            for (int k = 0 ; k < m ; ++k) {
                sum += A[i * m + k] * B[k * q + j]; 
            }
            C[i * q + j] = sum;
        }
    }
}
void CheckResult(float *host , float *device , int N) {
    float eps = 1.0E-4;
    for (int i = 0 ; i < N ; ++i) {
        if (fabs(host[i] - device[i]) > eps) {
            printf("Results don\'t match!\n");
            printf("%f(host[%d] )!= %f(gpu[%d])\n", host[i], i, device[i], i);
            return;
        }
    }
    printf("Check result success!\n");
}
void initMatrix(float *arr, int size) {
    
    std::random_device rd;  
    std::mt19937 gen(rd()); 
    //[-1 , 1] , 怕爆精度
    std::uniform_real_distribution<float> dis(-1.0f, 1.0f); 
    for (int i = 0; i < size; ++i) {
        arr[i] = dis(gen);
    }
}
void Test_Device(float *host_A , float *host_B , float *host_C) {
     //GPU parallel start
    double start, finish , t;
    start = cpuSecond();
     //记得先取值 &
    float *device_A,*device_B,*device_C;
    cudaMalloc((void**)&device_A , bytesA);
    cudaMalloc((void**)&device_B , bytesB);
    cudaMalloc((void**)&device_C , bytesC);

    cudaMemcpy(device_A , host_A , bytesA, cudaMemcpyHostToDevice);
    cudaMemcpy(device_B , host_B , bytesB, cudaMemcpyHostToDevice);
    
    dim3 block(Block_Dim , Block_Dim); //16 * 16 = 256
    //注意一对多，grid大小肯定要修改
    int block_cover_x = TM * block.x;
    int block_cover_y = TN * block.y;
    dim3 grid((n + block_cover_x - 1) / block_cover_x , (q + block_cover_y - 1) / block_cover_y);
    
    MatMul_Device<<<grid , block>>>(device_A , device_B , device_C , n , m , q);
    cudaDeviceSynchronize();  
    finish = cpuSecond();
    t = finish - start;
    printf("GPU %lf s\n", t);

    float *result_from_gpu;
    result_from_gpu = (float*)malloc(bytesC);
    cudaMemcpy(result_from_gpu , device_C , bytesC , cudaMemcpyDeviceToHost);

     //检查结果
    CheckResult(host_C , result_from_gpu , sizeC);

    //释放内存
    cudaFree(device_A);
    cudaFree(device_B);
    cudaFree(device_C);
    free(result_from_gpu);
}

int main() {
 
    double start, finish , t;
    srand(time(NULL));

    //A(n,m),B(m,q),C(n,q);
    float *host_A,*host_B,*host_C;
    host_A = (float*)malloc(bytesA);
    host_B = (float*)malloc(bytesB);
    host_C = (float*)malloc(bytesC);
    
    //初始化
    initMatrix(host_A , sizeA);
    initMatrix(host_B , sizeB);
 
    //CPU start
    start = cpuSecond();
    MatMul_Host(host_A , host_B , host_C , n , m , q);
    finish = cpuSecond();
    t = finish - start;
    printf("CPU %lf s\n", t);
    
    Test_Device(host_A , host_B , host_C);

    free(host_A);
    free(host_B);
    free(host_C);
    
    return 0;
}
```

![GEMMv4 优化全局内存到共享内存的搬运方式并对比运行时间](../../assets/posts/gemm/gemmv4-optimized-copy.webp)

+ 思考

    + 跟 `GEMMv3` 的变化就是帮运 `SA` 和 `SB` 的时候动用整个 `block` 的线程 ( `128 * 8 = 32 * 32` 刚好一一对应)

    + 没时间了，其他细节写注释里面了
***
#### `GEMMv5`

![GEMMv5 使用 float4 向量化访存和相应的矩阵分块](../../assets/posts/gemm/gemmv5-float4.webp)

+ 使用 `float4` ，一条汇编指令就能连续读取 `4` 个浮点数，极大提高了内存吞吐量，减少了访存指令数量。（`16` 字节）

+ 当你使用 `float4` 去读取内存时，`GPU` 硬件有一个极其严苛的要求：被读取的内存起始地址，必须是 `16` 字节（`128` `bit`）的整数倍

+ 代码

```cuda
__global__ void MatMul_Device(float *A , float *B , float *C ,int n,int m,int q) {
    
    __shared__ float SA[BM * BK]; //float4读取必须行优先,在GPU中行坐标地址连续
    __shared__ float SB[BK * BN];
    float tmp[TM][TN] = {0.0f};

    int indA = TM * (blockDim.x * blockIdx.x); 
    int indB = TN * (blockDim.y * blockIdx.y); 
    int idx = threadIdx.x + blockDim.x * threadIdx.y; //注意是 threadIdx.y，行优先。
    //SA[128][8] -> SA[128][8 / 4 = 2] ，这里必须行优先
    int rowA = idx / 2 , colA = idx % 2;
    //SB[8][128] -> SB[8][128 / 4 = 32]
    int rowB = idx / 32 , colB = idx % 32;
    int width = (m + BK - 1) / BK;
    
    for (int i = 0 ; i < width ; ++i) {
        
        //SA[rowA][colA * 4] A[indA + rowA][i * BK + 4 * colA]
        (float4 &)SA[rowA * BK + 4 * colA] = (float4 &)A[(indA + rowA) * m + i * BK + 4 * colA];
        //SB[rowB][colB * 4] B[i * BK + rowB][colB * 4 + indB]
        (float4 &)SB[rowB * BN + 4 * colB] = (float4 &)B[(i * BK + rowB) * q + 4 * colB + indB];
        for (int id = 0 ; id < 4 ; ++id) {
            if (indA + rowA >= n || i * BK + 4 * colA + id >= m) { //A的边界保护，越界一点没事
                SA[rowA * BK + 4 * colA + id] = 0.0f;
            }
            if (i * BK + rowB >= m || 4 * colB + indB + id >= q) {
                SB[rowB * BN + 4 * colB + id] = 0.0f;
            }
        }
        __syncthreads();

        //计算放入寄存器，这个线程归位了，用 16 * 16 线程计算 C[128][128] , 每个计算 TM * TN (8 * 8) 个
        for (int k = 0 ; k < BK ; ++k) {
            for (int r = 0 ; r < TM ; ++r) {
                for (int c = 0 ; c < TN ; ++c) { 
                    //SA[threadIdx.x * TM + r][k] SB[k][threadIdx.y * TN + c]
                    tmp[r][c] += SA[(threadIdx.x * TM + r) * BK + k] * SB[k * BN + threadIdx.y * TN + c];
                }
            }
        }
        __syncthreads();
    }

    //把 tmp 写入 C
    //写回 tmp[TM][TN] , 线程 32 * 32
    for (int r = 0 ; r < TM ; ++r) {
        for (int c = 0 ; c < TN ; ++c) {
            int reg_r = threadIdx.x * TM + r; //indA 换到最原始的定义 int indA = TM * (blockDim.x * blockIdx.x + threadIdx.x);
            int reg_c = threadIdx.y * TN + c;
            if (reg_r + indA < n && reg_c + indB < q) {
                C[(reg_r + indA) * q + reg_c + indB] = tmp[r][c];
            }
        }
    }

}
```
***
#### `GEMMv6`

+ 在 `GEMMv5` 中有这样一段代码

```cuda
tmp[r][c] += SA[(threadIdx.x * TM + r) * BK + k] * SB[k * BN + threadIdx.y * TN + c];
```
![代入 TM 和 BK 推导矩阵 A 在共享内存里的索引](../../assets/posts/gemm/gemmv6-sa-index.webp)

![用索引对 32 取余计算共享内存 Bank 编号](../../assets/posts/gemm/gemmv6-bank-index.webp)

![多个线程访问不同地址却映射到同一个共享内存 Bank 的示例](../../assets/posts/gemm/gemmv6-bank-conflict.webp)

![矩阵 B 利用同一地址广播避免共享内存 Bank 冲突的示例](../../assets/posts/gemm/gemmv6-sb-broadcast.webp)

+ 总结思路：把 `SA[128][8]` 转置为 `SA[8][128]`

+ 代码

```cuda
__global__ void MatMul_Device(float *A , float *B , float *C ,int n,int m,int q) {
    
    __shared__ float SA[BM * BK]; //float4读取必须行优先,在GPU中行坐标地址连续
    __shared__ float SB[BK * BN];
    float tmp[TM][TN] = {0.0f};

    int indA = TM * (blockDim.x * blockIdx.x); 
    int indB = TN * (blockDim.y * blockIdx.y); 
    int idx = threadIdx.x + blockDim.x * threadIdx.y; //注意是 threadIdx.y，行优先。
    //SA[128][8] -> SA[128][8 / 4 = 2] ，这里必须行优先
    int rowA = idx / 2 , colA = idx % 2;
    //SB[8][128] -> SB[8][128 / 4 = 32]
    int rowB = idx / 32 , colB = idx % 32;
    int width = (m + BK - 1) / BK;
    
    for (int i = 0 ; i < width ; ++i) {
        float a[4];
        (float4 &)a[0] = (float4 &)A[(indA + rowA) * m + i * BK + 4 * colA];
        for (int id = 0 ; id < 4 ; ++id) {
             if (indA + rowA < n && i * BK + 4 * colA + id < m) { //A的边界保护，越界一点没事
                //SA[rowA * BK + 4 * colA + id] = 0.0f;
                //SA[rowA][4 * colA + id] 转置 SA[4 * colA + id][rowA]
                SA[(4 * colA + id) * BM + rowA] = a[id];
            } else {
                SA[(4 * colA + id) * BM + rowA] = 0.0f;
            }
        }
      
        //SB[rowB][colB * 4] B[i * BK + rowB][colB * 4 + indB]
        (float4 &)SB[rowB * BN + 4 * colB] = (float4 &)B[(i * BK + rowB) * q + 4 * colB + indB];
        for (int id = 0 ; id < 4 ; ++id) {
            if (i * BK + rowB >= m || 4 * colB + indB + id >= q) {
                SB[rowB * BN + 4 * colB + id] = 0.0f;
            }
        }
        __syncthreads();

        //计算放入寄存器，这个线程归位了，用 16 * 16 线程计算 C[128][128] , 每个计算 TM * TN (8 * 8) 个
        for (int k = 0 ; k < BK ; ++k) {
            for (int r = 0 ; r < TM ; ++r) {
                for (int c = 0 ; c < TN ; ++c) { 
                    //SA[threadIdx.x * TM + r][k] SB[k][threadIdx.y * TN + c]
                    //SA[threadIdx.x * TM + r][k] 转置 SA[k][threadIdx.x * TM + r]
                    tmp[r][c] += SA[k * BM + (threadIdx.x * TM + r)] * SB[k * BN + threadIdx.y * TN + c];
                }
            }
        }
        __syncthreads();
    }

    //把 tmp 写入 C
    //写回 tmp[TM][TN] , 线程 32 * 32
    for (int r = 0 ; r < TM ; ++r) {
        for (int c = 0 ; c < TN ; ++c) {
            int reg_r = threadIdx.x * TM + r; //indA 换到最原始的定义 int indA = TM * (blockDim.x * blockIdx.x + threadIdx.x);
            int reg_c = threadIdx.y * TN + c;
            if (reg_r + indA < n && reg_c + indB < q) {
                C[(reg_r + indA) * q + reg_c + indB] = tmp[r][c];
            }
        }
    }

}
```
***
#### `GEMMv7`

![GEMMv7 利用寄存器复用减少共享内存读操作](../../assets/posts/gemm/gemmv7-register-reuse.webp)

+ 之前的注释也提过，在写入 `tmp` 的时候，把 `k` 移到外层，内部的 `share Memery` 的 `SA` 和 `SB` 可以写入寄存器

```cuda
__global__ void MatMul_Device(float *A , float *B , float *C ,int n,int m,int q) {
    
    __shared__ float SA[BM * BK]; //float4读取必须行优先,在GPU中行坐标地址连续
    __shared__ float SB[BK * BN];
    float tmp[TM][TN] = {0.0f};

    int indA = TM * (blockDim.x * blockIdx.x); 
    int indB = TN * (blockDim.y * blockIdx.y); 
    int idx = threadIdx.x + blockDim.x * threadIdx.y; //注意是 threadIdx.y，行优先。
    //SA[128][8] -> SA[128][8 / 4 = 2] ，这里必须行优先
    int rowA = idx / 2 , colA = idx % 2;
    //SB[8][128] -> SB[8][128 / 4 = 32]
    int rowB = idx / 32 , colB = idx % 32;
    int width = (m + BK - 1) / BK;
    
    float a[4];
    float com_a[TM];
    float com_b[TN];
    for (int i = 0 ; i < width ; ++i) {
        (float4 &)a[0] = (float4 &)A[(indA + rowA) * m + i * BK + 4 * colA];
        for (int id = 0 ; id < 4 ; ++id) {
             if (indA + rowA < n && i * BK + 4 * colA + id < m) { //A的边界保护，越界一点没事
                //SA[rowA * BK + 4 * colA + id] = 0.0f;
                //SA[rowA][4 * colA + id] 转置 SA[4 * colA + id][rowA]
                SA[(4 * colA + id) * BM + rowA] = a[id];
            } else {
                SA[(4 * colA + id) * BM + rowA] = 0.0f;
            }
        }
      
        //SB[rowB][colB * 4] B[i * BK + rowB][colB * 4 + indB]
        (float4 &)SB[rowB * BN + 4 * colB] = (float4 &)B[(i * BK + rowB) * q + 4 * colB + indB];
        for (int id = 0 ; id < 4 ; ++id) {
            if (i * BK + rowB >= m || 4 * colB + indB + id >= q) {
                SB[rowB * BN + 4 * colB + id] = 0.0f;
            }
        }
        __syncthreads();

        //改变的地方，之前提过，k 固定后，里面用 寄存器取出来
        //计算放入寄存器，这个线程归位了，用 16 * 16 线程计算 C[128][128] , 每个计算 TM * TN (8 * 8) 个
        for (int k = 0 ; k < BK ; ++k) {
            (float4 &)com_a[0] = (float4 &)SA[k * BM + (threadIdx.x * TM)];
            (float4 &)com_a[4] = (float4 &)SA[k * BM + (threadIdx.x * TM + 4)];
            (float4 &)com_b[0] = (float4 &)SB[k * BN + threadIdx.y * TN];
            (float4 &)com_b[4] = (float4 &)SB[k * BN + threadIdx.y * TN + 4];
            for (int r = 0 ; r < TM ; ++r) {
                for (int c = 0 ; c < TN ; ++c) { 
                    //SA[threadIdx.x * TM + r][k] SB[k][threadIdx.y * TN + c]
                    //SA[threadIdx.x * TM + r][k] 转置 SA[k][threadIdx.x * TM + r]
                    //tmp[r][c] += SA[k * BM + (threadIdx.x * TM + r)] * SB[k * BN + threadIdx.y * TN + c];
                    tmp[r][c] += com_a[r] * com_b[c];
                }
            }
        }
        __syncthreads();
    }

    //把 tmp 写入 C
    //写回 tmp[TM][TN] , 线程 32 * 32
    for (int r = 0 ; r < TM ; ++r) {
        for (int c = 0 ; c < TN ; ++c) {
            int reg_r = threadIdx.x * TM + r; //indA 换到最原始的定义 int indA = TM * (blockDim.x * blockIdx.x + threadIdx.x);
            int reg_c = threadIdx.y * TN + c;
            if (reg_r + indA < n && reg_c + indB < q) {
                C[(reg_r + indA) * q + reg_c + indB] = tmp[r][c];
            }
        }
    }

}
```
***
#### `GEMMv8`

![GEMMv8 通过双缓冲将全局内存搬运与矩阵计算重叠](../../assets/posts/gemm/gemmv8-pipeline.webp)

![GEMMv7 里数据搬运、同步和计算串行执行的问题](../../assets/posts/gemm/gemmv8-serialized-stages.webp)

![两个共享内存缓冲区交替承担数据搬运和计算](../../assets/posts/gemm/gemmv8-double-buffer.webp)

![双缓冲实现所需的共享内存数组声明和循环结构](../../assets/posts/gemm/gemmv8-buffer-layout.webp)

![双缓冲流水线仍需线程块同步的原因](../../assets/posts/gemm/gemmv8-thread-synchronization.webp)

+ 滚动数组思想

+ 代码

```cuda
__global__ void MatMul_Device(float *A , float *B , float *C ,int n,int m,int q) {
    
    __shared__ float SA[BM * BK * 2]; //要并行流水，shared Memery 开 2 倍
    __shared__ float SB[BK * BN * 2];
    float tmp[TM][TN] = {0.0f};

    int indA = TM * (blockDim.x * blockIdx.x); 
    int indB = TN * (blockDim.y * blockIdx.y); 
    int idx = threadIdx.x + blockDim.x * threadIdx.y; //注意是 threadIdx.y，行优先。
    //SA[128][8] -> SA[128][8 / 4 = 2] ，这里必须行优先
    int rowA = idx / 2 , colA = idx % 2;
    //SB[8][128] -> SB[8][128 / 4 = 32]
    int rowB = idx / 32 , colB = idx % 32;
    int width = (m + BK - 1) / BK;
    
    float a[4];
    float com_a[TM];
    float com_b[TN];

    int i = 0;
    //提取 i = 0 到数据的前半段
    (float4 &)a[0] = (float4 &)A[(indA + rowA) * m + i * BK + 4 * colA];
    for (int id = 0 ; id < 4 ; ++id) {
         if (indA + rowA < n && i * BK + 4 * colA + id < m) { //A的边界保护，越界一点没事
            //SA[rowA * BK + 4 * colA + id] = 0.0f;
            //SA[rowA][4 * colA + id] 转置 SA[4 * colA + id][rowA]
            SA[(4 * colA + id) * BM + rowA] = a[id];
        } else {
            SA[(4 * colA + id) * BM + rowA] = 0.0f;
        }
    }
   
    (float4 &)SB[rowB * BN + 4 * colB] = (float4 &)B[(i * BK + rowB) * q + 4 * colB + indB];
    for (int id = 0 ; id < 4 ; ++id) {
        if (i * BK + rowB >= m || 4 * colB + indB + id >= q) {
            SB[rowB * BN + 4 * colB + id] = 0.0f;
        }
    }
    __syncthreads();
    //存-算-存-算，滚动数组
    for (i = 1 ; i < width ; ++i) {
        (float4 &)a[0] = (float4 &)A[(indA + rowA) * m + i * BK + 4 * colA];
        for (int id = 0 ; id < 4 ; ++id) {
             if (indA + rowA < n && i * BK + 4 * colA + id < m) { //A的边界保护，越界一点没事
                //SA[rowA * BK + 4 * colA + id] = 0.0f;
                //SA[rowA][4 * colA + id] 转置 SA[4 * colA + id][rowA]
                SA[(4 * colA + id) * BM + rowA + i % 2 * BM * BK] = a[id];
            } else {
                SA[(4 * colA + id) * BM + rowA + i % 2 * BM * BK] = 0.0f;
            }
        }
      
        //SB[rowB][colB * 4] B[i * BK + rowB][colB * 4 + indB]
        (float4 &)SB[rowB * BN + 4 * colB + i % 2 * BK * BN] = (float4 &)B[(i * BK + rowB) * q + 4 * colB + indB];
        for (int id = 0 ; id < 4 ; ++id) {
            if (i * BK + rowB >= m || 4 * colB + indB + id >= q) {
                SB[rowB * BN + 4 * colB + id + i % 2 * BK * BN] = 0.0f;
            }
        }
        //__syncthreads(); , 这里就不用了

        //改变的地方，之前提过，k 固定后，里面用 寄存器取出来
        //计算放入寄存器，这个线程归位了，用 16 * 16 线程计算 C[128][128] , 每个计算 TM * TN (8 * 8) 个
        for (int k = 0 ; k < BK ; ++k) {
            (float4 &)com_a[0] = (float4 &)SA[k * BM + (threadIdx.x * TM) + (i - 1) % 2 * BM * BK];
            (float4 &)com_a[4] = (float4 &)SA[k * BM + (threadIdx.x * TM + 4 + (i - 1) % 2 * BM * BK)];
            (float4 &)com_b[0] = (float4 &)SB[k * BN + threadIdx.y * TN + (i - 1) % 2 * BK * BN];
            (float4 &)com_b[4] = (float4 &)SB[k * BN + threadIdx.y * TN + 4 + (i - 1) % 2 * BK * BN];
            for (int r = 0 ; r < TM ; ++r) {
                for (int c = 0 ; c < TN ; ++c) { 
                    //SA[threadIdx.x * TM + r][k] SB[k][threadIdx.y * TN + c]
                    //SA[threadIdx.x * TM + r][k] 转置 SA[k][threadIdx.x * TM + r]
                    //tmp[r][c] += SA[k * BM + (threadIdx.x * TM + r)] * SB[k * BN + threadIdx.y * TN + c];
                    tmp[r][c] += com_a[r] * com_b[c];
                }
            }
        }
        __syncthreads();
    }

   // i = width;
    for (int k = 0 ; k < BK ; ++k) {
        (float4 &)com_a[0] = (float4 &)SA[k * BM + (threadIdx.x * TM) + (i - 1) % 2 * BM * BK];
        (float4 &)com_a[4] = (float4 &)SA[k * BM + (threadIdx.x * TM + 4 + (i - 1) % 2 * BM * BK)];
        (float4 &)com_b[0] = (float4 &)SB[k * BN + threadIdx.y * TN + (i - 1) % 2 * BK * BN];
        (float4 &)com_b[4] = (float4 &)SB[k * BN + threadIdx.y * TN + 4 + (i - 1) % 2 * BK * BN];
        for (int r = 0 ; r < TM ; ++r) {
            for (int c = 0 ; c < TN ; ++c) { 
                //SA[threadIdx.x * TM + r][k] SB[k][threadIdx.y * TN + c]
                //SA[threadIdx.x * TM + r][k] 转置 SA[k][threadIdx.x * TM + r]
                //tmp[r][c] += SA[k * BM + (threadIdx.x * TM + r)] * SB[k * BN + threadIdx.y * TN + c];
                tmp[r][c] += com_a[r] * com_b[c];
            }
        }
    } 
   //把 tmp 写入 C
    //写回 tmp[TM][TN] , 线程 32 * 32
    for (int r = 0 ; r < TM ; ++r) {
        for (int c = 0 ; c < TN ; ++c) {
            int reg_r = threadIdx.x * TM + r; //indA 换到最原始的定义 int indA = TM * (blockDim.x * blockIdx.x + threadIdx.x);
            int reg_c = threadIdx.y * TN + c;
            if (reg_r + indA < n && reg_c + indB < q) {
                C[(reg_r + indA) * q + reg_c + indB] = tmp[r][c];
            }
        }
    }

}
```
***
