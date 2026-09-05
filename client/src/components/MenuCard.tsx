import React, { useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function MenuCard({
  menu,
  showActions = false,
  onEdit,
  onDelete,
  onAddItems,
  onPress,
}: any) {

  const scale = useRef(new Animated.Value(1)).current;
  const editScale = useRef(new Animated.Value(1)).current;
  const deleteScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale,{
      toValue:0.97,
      useNativeDriver:true,
      speed:40,
      bounciness:6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale,{
      toValue:1,
      useNativeDriver:true,
      speed:40,
      bounciness:6,
    }).start();
  };

  const animateIcon = (anim:Animated.Value,to:number)=>{
    Animated.spring(anim,{
      toValue:to,
      useNativeDriver:true,
      speed:50,
      bounciness:8,
    }).start();
  };

  return (

<View style={styles.cardContainer}>

<Animated.View style={{transform:[{scale}]}}>

<View style={styles.card}>

<Pressable
onPress={onPress}
onPressIn={handlePressIn}
onPressOut={handlePressOut}
disabled={!onPress}
>

<Image source={{uri:menu.heroImageUrl}} style={styles.hero}/>

{showActions && (
<>
<Animated.View style={[styles.iconWrapper,{left:18,transform:[{scale:editScale}]}]}>
<TouchableOpacity
activeOpacity={0.8}
onPressIn={()=>animateIcon(editScale,0.85)}
onPressOut={()=>animateIcon(editScale,1)}
onPress={(e)=>{
e.stopPropagation();
onEdit?.(menu);
}}>
<Ionicons name="create-outline" size={24} color="#de0c0c"/>
</TouchableOpacity>
</Animated.View>

<Animated.View style={[styles.iconWrapper,{right:18,transform:[{scale:deleteScale}]}]}>
<TouchableOpacity
activeOpacity={0.8}
onPressIn={()=>animateIcon(deleteScale,0.85)}
onPressOut={()=>animateIcon(deleteScale,1)}
onPress={(e)=>{
e.stopPropagation();
onDelete?.(menu);
}}>
<Ionicons name="trash-outline" size={24} color="#ef1010"/>
</TouchableOpacity>
</Animated.View>
</>
)}

<View style={styles.badge}>
<Text style={styles.badgeText}>
{menu.itemsPerPlate} Item{menu.itemsPerPlate>1?"s":""}
</Text>
</View>

<View style={styles.headerBody}>

<View style={styles.row}>

<Text
numberOfLines={1}
style={styles.title}
>
{menu.name}
</Text>

<Text
numberOfLines={1}
style={styles.price}
>
Starts @ <Text style={styles.priceBold}>₹{menu.price}</Text>{" "}
<Text style={styles.perPlate}>/Plate</Text>
</Text>

</View>

<View style={styles.separator}/>

</View>

</Pressable>

<View style={styles.body}>

<Text style={styles.section}>WHAT’S IN THE PLATE</Text>

<ScrollView
horizontal
showsHorizontalScrollIndicator={false}
style={styles.itemsScroll}
contentContainerStyle={styles.itemsContainer}
decelerationRate="fast"
scrollEventThrottle={16}
>

{menu.plateItems?.map((item:any,i:number)=>(
<View key={item._id||item.id||i} style={styles.itemWrapper}>

<View style={styles.itemCircle}>
<Image
source={{uri:item.imageUrl}}
style={styles.itemImg}
/>
</View>

<Text numberOfLines={1} style={styles.itemText}>
{item.name}
</Text>

</View>
))}

</ScrollView>

{onAddItems && (

<TouchableOpacity
style={styles.addItemsBtn}
onPress={()=>onAddItems(menu)}
activeOpacity={0.85}
>

<Ionicons name="add-circle-outline" size={18} color="#fff"/>

<Text style={styles.addItemsText}>
Add Items
</Text>

</TouchableOpacity>

)}

</View>

</View>

</Animated.View>

</View>

  );
}

const styles = StyleSheet.create({

cardContainer:{
paddingHorizontal:8,
paddingVertical:14,
backgroundColor:"#f8f9fa",
},

card:{
backgroundColor:"#ffffff",
borderRadius:26,
overflow:"hidden",
elevation:14,
shadowColor:"#000",
shadowOpacity:0.12,
shadowRadius:18,
shadowOffset:{width:0,height:10},
},

hero:{
width:"100%",
height:190,
},

iconWrapper:{
position:"absolute",
top:18,
zIndex:10,
},

badge:{
position:"absolute",
top:12,
right:12,
backgroundColor:"#1B5E20",
paddingHorizontal:10,
paddingVertical:5,
borderRadius:12,
},

badgeText:{
fontWeight:"600",
fontSize:12,
color:"#fff",
},

headerBody:{
paddingTop:22,
},

row:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
paddingHorizontal:16,
},

title:{
fontSize:18,
fontWeight:"700",
color:"#111",
flex:1,
},

price:{
fontSize:14,
color:"#6b7280",
},

priceBold:{
fontSize:18,
fontWeight:"700",
color:"#111",
},

perPlate:{
fontSize:13,
color:"#6b7280",
},

separator:{
height:1,
borderBottomWidth:1,
borderStyle:"dashed",
borderColor:"#d1d5db",
marginTop:14,
marginBottom:2,
width:"100%",
},

body:{
paddingBottom:18,
},

section:{
color:"#1B5E20",
fontWeight:"800",
fontSize:14,
marginBottom:12,
letterSpacing:0.5,
paddingHorizontal:18,
},

itemWrapper:{
alignItems:"center",
marginRight:12,
width:72,
},

itemCircle:{
width:72,
height:72,
borderRadius:36,
backgroundColor:"#f3f4f6",
justifyContent:"center",
alignItems:"center",
},

itemImg:{
width:60,
height:60,
borderRadius:30,
},

itemText:{
fontSize:12,
marginTop:8,
textAlign:"center",
color:"#374151",
},

addItemsBtn:{
marginTop:18,
backgroundColor:"#1B5E20",
paddingVertical:12,
borderRadius:14,
flexDirection:"row",
justifyContent:"center",
alignItems:"center",
gap:6,
marginHorizontal:18,
},

addItemsText:{
color:"#fff",
fontWeight:"600",
fontSize:14,
},

itemsScroll:{
marginRight:-18,
},

itemsContainer:{
paddingLeft:18,
paddingRight:22,
},

});