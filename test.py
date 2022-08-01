import pywavefront
curve = pywavefront.Wavefront('./src/assets/untitled.obj')
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()
print()

vertices = []
# convert each tuple in curve.vertices into a dictionary of x y z
for i in range(len(curve.vertices)):
    new_dict = {}
    new_dict['x'] = curve.vertices[i][0]
    new_dict['y'] = curve.vertices[i][1]
    new_dict['z'] = curve.vertices[i][2]
    vertices.append(new_dict)

vertices.reverse()
import numpy as np
import pandas as pd
df = pd.DataFrame(vertices)
# invert
# df['x'] = -df['x']
df.to_json('./src/assets/vertices.json', orient='records')
print(df)
# print(vertices)