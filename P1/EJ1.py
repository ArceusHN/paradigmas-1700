import math

def OperacionesAritmeticas(Num_1, Num_2, Signo):
    if Signo == "+":
        return Num_1 + Num_2
    elif Signo == "-":
        return Num_1 - Num_2
    elif Signo == "*":
        return Num_1 * Num_2
    elif Signo == "/":
        if Num_2 != 0:
            return Num_1 / Num_2
        else:
            return "Error: División por cero"
    elif Signo == "^":
        return math.pow(Num_1, Num_2)
    elif Signo == "log":
        if Num_1 > 0 and Num_2 > 0 and Num_2 != 1:
            return math.log(Num_1, Num_2)
        else:
            return "Error: Logaritmo no definido para los valores dados"
    elif Signo == "sqrt":
        if Num_1 >= 0:
            return math.sqrt(Num_1)
        else:
            return "Error: Raíz cuadrada no definida para números negativos"
    else:
        return "Error: Operación no válida"
    
def SumaMatrices(Matriz_1, Matriz_2):
    if len(Matriz_1) != len(Matriz_2) or len(Matriz_1[0]) != len(Matriz_2[0]):
        return "Error: Las matrices deben ser del mismo tamaño"
    
    Resultado = [[0 for _ in range(len(Matriz_1[0]))] for _ in range(len(Matriz_1))]
    
    for i in range(len(Matriz_1)):
        for j in range(len(Matriz_1[0])):
            Resultado[i][j] = Matriz_1[i][j] + Matriz_2[i][j]
    
    return Resultado

# Suma
Num_1 = 10
Num_2 = 5
Signo = "+"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

# Resta
Signo = "-"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

#Ejemplo de uso multiplicación
Signo = "*"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

#Ejemplo de uso división
Signo = "/"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

#Ejemplo de uso potencia
Signo = "^"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

#Ejemplo de uso logaritmo
Signo = "log"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

#Ejemplo de uso raíz cuadrada
Signo = "sqrt"
print(OperacionesAritmeticas(Num_1, Num_2, Signo))

Matriz_1 = [[1, 2], [3, 4]]
Matriz_2 = [[5, 6], [7, 8]]
print(SumaMatrices(Matriz_1, Matriz_2))

Matriz_1 = [[1, 2, 3], [4, 5, 6]]
Matriz_2 = [[7, 8, 9], [10, 11, 12]]
print(SumaMatrices(Matriz_1, Matriz_2))
